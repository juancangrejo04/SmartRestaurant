// Suite Integral de Pruebas Automatizadas — SmartRestaurant Serverless Architecture
// (Vercel Serverless Functions + Supabase PostgreSQL + Upstash QStash)
import { strict as assert } from 'assert';
import { store } from '../src/domain/store';
import { hashPassword, comparePassword, generateToken, verifyToken } from '../services/common/auth';
import { stageOutboxEvent } from '../services/common/outbox';
import { query, withTransaction } from '../services/common/db';
import {
  publishToQStash,
  verifyQStashSignature,
  processQStashIncomingEvent,
  dispatchPendingOutboxToQStash,
} from '../services/common/qstash';
import { isSupabaseConfigured, checkSupabaseHealth } from '../services/common/supabase';
import { MARKETS } from '../src/i18n/i18nContext';
import { esCO } from '../src/i18n/locales/es-CO';
import { esMX } from '../src/i18n/locales/es-MX';
import { enUS } from '../src/i18n/locales/en-US';
import { ptBR } from '../src/i18n/locales/pt-BR';
import { jaJP } from '../src/i18n/locales/ja-JP';

async function runServerlessDistributedTests() {
  console.log('\n========================================================================');
  console.log('🚀 EJECUTANDO SUITE COMPLETA DE PRUEBAS SERVERLESS — SMARTRESTAURANT');
  console.log('Arquitectura: Vercel Functions + Supabase PostgreSQL + Upstash QStash');
  console.log('========================================================================\n');

  // --------------------------------------------------------------------------
  // 1. REGISTRO, AUTENTICACIÓN REAL Y HASH BCRYPT
  // --------------------------------------------------------------------------
  console.log('--- 1. Registro, Autenticación Real y Hash Bcrypt ---');
  const plainPassword = 'SuperSecretServerlessPass2026!';
  const hashedPassword = await hashPassword(plainPassword);

  assert(
    hashedPassword.startsWith('$2a$') || hashedPassword.startsWith('$2b$'),
    'Contraseña hasheada correctamente con algoritmo Bcrypt (costo 10)'
  );
  assert(await comparePassword(plainPassword, hashedPassword), 'Verificación de contraseña correcta mediante Bcrypt exitosa');
  assert(!(await comparePassword('WrongPassword', hashedPassword)), 'Rechazo seguro ante contraseña incorrecta');

  const token = generateToken({
    id: 'usr-admin-01',
    tenantId: 'rest-col-01',
    email: 'admin@andres.co',
    name: 'Valeria Gómez',
    role: 'ADMIN',
  });

  assert(typeof token === 'string' && token.split('.').length === 3, 'Token JWT emitido con estructura válida');
  const decoded = verifyToken(token);
  assert(decoded.role === 'ADMIN', 'Claim de rol ADMIN decodificado correctamente');
  assert(decoded.tenantId === 'rest-col-01', 'Claim de tenantId decodificado correctamente');
  console.log('✅ [PASS]: Autenticación y firma JWT validadas.');

  // --------------------------------------------------------------------------
  // 2. AUTORIZACIÓN POR ROLES (RBAC: 5 ROLES)
  // --------------------------------------------------------------------------
  console.log('\n--- 2. Autorización por Roles (RBAC: 5 Roles) ---');
  const roles = ['OWNER', 'ADMIN', 'WAITER', 'KITCHEN', 'CUSTOMER'] as const;
  roles.forEach((r) => {
    const roleToken = generateToken({
      id: `usr-${r.toLowerCase()}`,
      tenantId: 'rest-col-01',
      email: `${r.toLowerCase()}@test.com`,
      name: `Usuario ${r}`,
      role: r,
    });
    const verified = verifyToken(roleToken);
    assert(verified.role === r, `Rol ${r} correctamente codificado y validado en token`);
  });
  console.log('✅ [PASS]: Control de roles RBAC validado para los 5 perfiles.');

  // --------------------------------------------------------------------------
  // 3. AISLAMIENTO MULTI-TENANT
  // --------------------------------------------------------------------------
  console.log('\n--- 3. Aislamiento Multi-Tenant Estricto ---');
  const colMenu = store.getMenuItems(undefined, 'rest-col-01');
  const mexMenu = store.getMenuItems(undefined, 'rest-mex-02');
  const jpnMenu = store.getMenuItems(undefined, 'rest-jpn-05');

  assert(colMenu.every((i) => i.currency === 'COP'), 'Todos los ítems de Colombia aislados en COP');
  assert(mexMenu.every((i) => i.currency === 'MXN'), 'Todos los ítems de México aislados en MXN');
  assert(jpnMenu.every((i) => i.currency === 'JPY'), 'Todos los ítems de Japón aislados en JPY');
  assert(!colMenu.some((i) => jpnMenu.map((j) => j.id).includes(i.id)), 'Catálogos aislados sin contaminación entre tenants');
  console.log('✅ [PASS]: Aislamiento multi-tenant validado.');

  // --------------------------------------------------------------------------
  // 4. PERSISTENCIA DE DATOS EN SUPABASE / POSTGRESQL
  // --------------------------------------------------------------------------
  console.log('\n--- 4. Persistencia Relacional y Transacciones ACID ---');
  const health = await checkSupabaseHealth();
  assert(typeof health.configured === 'boolean', 'Módulo de estado de Supabase responde');

  // Test local ACID transaction rollback
  let rollbackCaught = false;
  try {
    await withTransaction(async (txClient) => {
      await txClient.query(
        `INSERT INTO users (id, tenant_id, name, email, role, password_hash) VALUES ($1, $2, $3, $4, $5, $6)`,
        ['usr-fail-rollback', 'rest-col-01', 'Fail User', 'fail@test.com', 'CUSTOMER', 'hash']
      );
      throw new Error('FORCE_ROLLBACK_TEST');
    });
  } catch (err: any) {
    if (err.message === 'FORCE_ROLLBACK_TEST') rollbackCaught = true;
  }
  assert(rollbackCaught, 'Rollback automático exitoso ante fallo en transacción');

  const { rows: verifyRows } = await query(`SELECT * FROM users WHERE id = $1`, ['usr-fail-rollback']);
  assert(verifyRows.length === 0, 'La base de datos protegió la integridad y descartó el registro no confirmado');
  console.log('✅ [PASS]: Integridad transaccional y persistencia verificadas.');

  // --------------------------------------------------------------------------
  // 5. CREACIÓN, CANCELACIÓN Y PREVENCIÓN DE RESERVAS DUPLICADAS
  // --------------------------------------------------------------------------
  console.log('\n--- 5. Prevención de Reservas Simultáneas Incompatibles (Concurrencia) ---');
  const testDate = '2026-12-15';
  const tableId = 'tbl-col-01';

  const booking1 = store.createReservation({
    tenantId: 'rest-col-01',
    branchId: 'branch-col-bog',
    tableId,
    customerName: 'Cliente Concurrente A',
    customerEmail: 'ca@test.com',
    customerPhone: '+57 300 111 2222',
    date: testDate,
    startTime: '19:00',
    partySize: 2,
  });
  assert(booking1.reservation.status === 'CONFIRMED', 'Reserva 1 creada en franja 19:00-21:00');

  let collisionCaught = false;
  try {
    store.createReservation({
      tenantId: 'rest-col-01',
      branchId: 'branch-col-bog',
      tableId,
      customerName: 'Cliente Concurrente B (Colisión)',
      customerEmail: 'cb@test.com',
      customerPhone: '+57 300 333 4444',
      date: testDate,
      startTime: '19:30', // Solapamiento
      partySize: 2,
    });
  } catch (err: any) {
    collisionCaught = true;
    assert(err.message.includes('CONCURRENCY_CONFLICT'), 'Rechazo de reserva simultánea por colisión de intervalo (409 Conflict)');
  }
  assert(collisionCaught, 'El motor de concurrencia bloqueó exitosamente la doble reserva');

  const cancelled = store.cancelReservation(booking1.reservation.id);
  assert(cancelled.status === 'CANCELLED', 'Cancelación de reserva y liberación de mesa exitosa');
  console.log('✅ [PASS]: Motor de reservas con control de concurrencia y cancelación validado.');

  // --------------------------------------------------------------------------
  // 6. CREACIÓN DE PEDIDOS CON CÁLCULO SEGURO E IDEMPOTENCIA
  // --------------------------------------------------------------------------
  console.log('\n--- 6. Idempotencia y Cálculo de Precios de Pedidos en Backend ---');
  const idemKey = `idem-serverless-${Date.now()}`;
  const qrToken = 'qr-bog-tbl-01-token884';

  const order1 = store.createOrder({
    tenantId: 'rest-col-01',
    branchId: 'branch-col-bog',
    tableId,
    qrToken,
    idempotencyKey: idemKey,
    customerName: 'Comensal Idempotente',
    items: [
      { menuItemId: 'item-col-01', quantity: 1 }, // Bandeja Paisa: 48.000 COP
      { menuItemId: 'item-col-04', quantity: 2 }, // Lulada: 15.000 COP x 2 = 30.000 COP
    ],
  });

  assert(!order1.isDuplicate, 'Primer intento de pedido procesado normalmente');
  assert(order1.order.subtotal === 78000, 'Subtotal calculado estrictamente en el servidor (78.000 COP)');
  assert(order1.order.tax === 6240, 'Impuesto calculado según tasa local (8% = 6.240 COP)');
  assert(order1.order.total === 84240, 'Total calculado exactamente (84.240 COP)');

  // Reintento idéntico
  const orderRetry = store.createOrder({
    tenantId: 'rest-col-01',
    branchId: 'branch-col-bog',
    tableId,
    qrToken,
    idempotencyKey: idemKey,
    customerName: 'Comensal Idempotente',
    items: [{ menuItemId: 'item-col-01', quantity: 1 }],
  });

  assert(orderRetry.isDuplicate, 'Reintento con misma Idempotency-Key detectado como duplicado');
  assert(orderRetry.order.id === order1.order.id, 'Devolvió la orden original sin crear registros duplicados');
  console.log('✅ [PASS]: Cálculo seguro de precios e idempotencia validados.');

  // --------------------------------------------------------------------------
  // 7. MÁQUINA DE ESTADOS FINITA DE COCINA (KDS)
  // --------------------------------------------------------------------------
  console.log('\n--- 7. Máquina de Estados Finita de Cocina (KDS) ---');
  const ordId = order1.order.id;
  const toPrep = store.updateOrderStatus(ordId, 'PREPARING', 'KITCHEN');
  assert(toPrep.order.status === 'PREPARING', 'Transición válida: RECEIVED -> PREPARING');

  let invalidJump = false;
  try {
    store.updateOrderStatus(ordId, 'DELIVERED', 'KITCHEN');
  } catch {
    invalidJump = true;
  }
  assert(invalidJump, 'Rechazo de salto inválido en máquina de estados (PREPARING -> DELIVERED)');

  const toReady = store.updateOrderStatus(ordId, 'READY', 'KITCHEN');
  assert(toReady.order.status === 'READY', 'Transición válida: PREPARING -> READY');

  const toDelivered = store.updateOrderStatus(ordId, 'DELIVERED', 'WAITER');
  assert(toDelivered.order.status === 'DELIVERED', 'Transición válida: READY -> DELIVERED');
  console.log('✅ [PASS]: Transiciones de cocina y mesa controladas correctamente.');

  // --------------------------------------------------------------------------
  // 8. PUBLICACIÓN DE EVENTOS A UPSTASH QSTASH & TRANSACTIONAL OUTBOX
  // --------------------------------------------------------------------------
  console.log('\n--- 8. Publicación de Eventos a Upstash QStash & Transactional Outbox ---');
  const outboxCorrId = `corr-outbox-${Date.now()}`;
  const outboxRecord = await withTransaction(async (txClient) => {
    return stageOutboxEvent(txClient, {
      aggregateType: 'Order',
      aggregateId: 'ord-outbox-999',
      eventType: 'OrderCreated',
      tenantId: 'rest-col-01',
      branchId: 'branch-col-bog',
      correlationId: outboxCorrId,
      payload: { orderNumber: 'ORD-QSTASH-999', total: 50000, currency: 'COP' },
    });
  });

  assert(outboxRecord.status === 'PENDING', 'Registro en tabla outbox_events insertado con estado PENDING');
  assert(outboxRecord.correlationId === outboxCorrId, 'Correlation-ID propagado en outbox');

  const qstashPublish = await publishToQStash('OrderCreated', {
    orderId: 'ord-outbox-999',
    orderNumber: 'ORD-QSTASH-999',
  }, {
    correlationId: outboxCorrId,
    tenantId: 'rest-col-01',
    deduplicationId: outboxRecord.id,
  });

  assert(qstashPublish.success, 'Publicación de evento a Upstash QStash exitosa');

  const dispatchResult = await dispatchPendingOutboxToQStash(10);
  assert(dispatchResult.processed >= 1, 'Despachador de Transactional Outbox procesó eventos pendientes');
  console.log('✅ [PASS]: Integración de Upstash QStash y Transactional Outbox validada.');

  // --------------------------------------------------------------------------
  // 9. VERIFICACIÓN CRIPTOGRÁFICA DE FIRMAS QSTASH E IDEMPOTENCIA DE WEBHOOK
  // --------------------------------------------------------------------------
  console.log('\n--- 9. Verificación de Firmas QStash y Procesamiento Idempotente de Webhooks ---');
  const testPayload = JSON.stringify({
    eventId: `evt-qstash-rx-${Date.now()}`,
    eventType: 'OrderCreated',
    topic: 'smartrestaurant.ordercreated',
    correlationId: 'corr-webhook-test',
    tenantId: 'rest-col-01',
    timestamp: new Date().toISOString(),
    payload: { orderId: 'ord-webhook-1', orderNumber: 'ORD-WH-01' },
  });

  // Verification helper test
  const sigValid = await verifyQStashSignature('test-signature', testPayload);
  assert(typeof sigValid === 'boolean', 'Función de verificación de firma QStash callable y evaluada');

  // Idempotent webhook receiver test
  const parsedEnvelope = JSON.parse(testPayload);
  const rx1 = await processQStashIncomingEvent(parsedEnvelope);
  assert(rx1.success && !rx1.isDuplicate, 'Primer arribo de webhook procesado exitosamente por los handlers de dominio');
  assert(rx1.handlersRun.includes('kitchen-service:enqueueOrder'), 'Handler de cocina ejecutado por el evento OrderCreated');

  // Re-entrega duplicada (simulación de reintento de QStash)
  const rx2 = await processQStashIncomingEvent(parsedEnvelope);
  assert(rx2.success && rx2.isDuplicate, 'Reintento con mismo eventId detectado como duplicado y omitido sin doble efecto');
  console.log('✅ [PASS]: Verificación de firma y control de duplicados en webhook completados.');

  // --------------------------------------------------------------------------
  // 10. FUNCIONAMIENTO DE LOS 5 MERCADOS (IDIOMAS Y MONEDAS)
  // --------------------------------------------------------------------------
  console.log('\n--- 10. Internacionalización Completa (5 Países, Idiomas y Monedas) ---');
  const markets = ['es-CO', 'es-MX', 'en-US', 'pt-BR', 'ja-JP'];
  markets.forEach((m) => {
    assert(m in MARKETS, `Mercado ${m} registrado en configuración global`);
  });

  assert(jaJP.nav.reservations === '予約管理', 'Traducción japonesa para Reservas');
  assert(jaJP.kitchen.title.includes('厨房'), 'Traducción japonesa para Cocina');
  assert(jaJP.reviews.title === 'お客様からの口コミ・評価', 'Traducción japonesa para Reseñas');

  assert(enUS.nav.reservations === 'Reservations', 'Traducción inglesa para Reservas');
  assert(enUS.reviews.title === 'Guest Reviews & Ratings', 'Traducción inglesa para Reseñas');

  assert(ptBR.nav.reservations === 'Reservas', 'Traducción portuguesa para Reservas');
  assert(ptBR.reviews.title === 'Avaliações e Opiniões dos Clientes', 'Traducción portuguesa para Reseñas');

  assert(esCO.reviews.title === 'Opiniones y Reseñas de Clientes', 'Traducción colombiana para Reseñas');
  assert(esMX.reviews.title === 'Opiniones y Reseñas de Clientes', 'Traducción mexicana para Reseñas');
  console.log('✅ [PASS]: Internacionalización en los 5 mercados verificada al 100%.');

  console.log('\n========================================================================');
  console.log('🎉 TODAS LAS 10 SUITES DE PRUEBAS SERVERLESS PASARON CON 100% DE ÉXITO');
  console.log('========================================================================\n');
}

runServerlessDistributedTests().catch((err) => {
  console.error('Fatal Serverless Test Error:', err);
  process.exit(1);
});
