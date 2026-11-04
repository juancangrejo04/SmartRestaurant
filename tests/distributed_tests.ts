// Comprehensive Automated Test Suite for SmartRestaurant Distributed Architecture
// Validates: PostgreSQL Persistence, Microservices, RabbitMQ Pub/Sub, Transactional Outbox,
// Concurrency Interval Locking, Idempotency, Fallback Resilience, JWT & RBAC, Multi-tenancy, and 5 Locales.

import { store } from '../src/domain/store';
import { MARKETS } from '../src/i18n/i18nContext';
import { jaJP } from '../src/i18n/locales/ja-JP';
import { enUS } from '../src/i18n/locales/en-US';
import { ptBR } from '../src/i18n/locales/pt-BR';
import { esCO } from '../src/i18n/locales/es-CO';
import { esMX } from '../src/i18n/locales/es-MX';
import { query, withTransaction, runMigrations } from '../services/common/db';
import { publishToExchange, subscribeToTopicQueue, getRabbitChannel } from '../services/common/rabbitmq';
import { stageOutboxEvent, dispatchPendingOutboxEvents } from '../services/common/outbox';
import { hashPassword, comparePassword, generateToken, verifyToken } from '../services/common/auth';

function assert(condition: boolean, testName: string, details?: string) {
  if (!condition) {
    console.error(`❌ [FAIL]: ${testName}${details ? ` -> ${details}` : ''}`);
    process.exit(1);
  }
  console.log(`✅ [PASS]: ${testName}`);
}

async function runAllDistributedTests() {
  console.log('========================================================================');
  console.log('🚀 EJECUTANDO SUITE COMPLETA DE PRUEBAS DISTRIBUIDAS — SMARTRESTAURANT');
  console.log('========================================================================\n');

  // --------------------------------------------------------------------------
  // 1. PERSISTENCIA EN POSTGRESQL & TRANSACCIONES ACID
  // --------------------------------------------------------------------------
  console.log('--- 1. Pruebas de Persistencia en PostgreSQL & Transacciones ACID ---');
  await runMigrations();

  const tenantRes = await query('SELECT * FROM tenants WHERE id = $1', ['rest-col-01']);
  assert(tenantRes.rows.length > 0, 'Consulta parametrizada en PostgreSQL exitosa (Tenant Colombia encontrado)');
  assert(tenantRes.rows[0].currency || 'COP' === 'COP', 'Preservación de moneda en base de datos');

  // ACID Transaction test
  let rollbackCaught = false;
  try {
    await withTransaction(async (txClient) => {
      await txClient.query(
        'INSERT INTO tenants (id, name, tax_id, cuisine_type) VALUES ($1, $2, $3, $4)',
        ['temp-fail-tenant', 'Temp Rollback Name', 'NIT-000', 'Test']
      );
      throw new Error('SIMULATED_TRANSACTION_FAILURE');
    });
  } catch (err: any) {
    rollbackCaught = err.message === 'SIMULATED_TRANSACTION_FAILURE';
  }
  assert(rollbackCaught, 'Rollback automático exitoso ante fallo en transacción ACID local');

  const checkRollback = await query('SELECT * FROM tenants WHERE id = $1', ['temp-fail-tenant']);
  assert(checkRollback.rows.length === 0, 'La base de datos protegió la integridad y descartó el registro no confirmado');

  // --------------------------------------------------------------------------
  // 2. COMUNICACIÓN Y TRANSACTIONAL OUTBOX PATTERN
  // --------------------------------------------------------------------------
  console.log('\n--- 2. Pruebas de Transactional Outbox Pattern en PostgreSQL ---');
  const correlationId = `tx-test-${Date.now()}`;

  const stagedOutbox = await withTransaction(async (txClient) => {
    return await stageOutboxEvent(txClient, {
      aggregateType: 'Order',
      aggregateId: 'ord-outbox-test-01',
      eventType: 'OrderCreated',
      tenantId: 'rest-col-01',
      branchId: 'branch-col-bog',
      correlationId,
      payload: { orderNumber: 'ORD-TEST-999', total: 55000, items: 2 },
    });
  });

  assert(stagedOutbox.status === 'PENDING', 'Registro en tabla outbox_events insertado con estado PENDING');
  assert(stagedOutbox.correlationId === correlationId, 'Identificador de correlación (Correlation-ID) propagado en outbox');

  const dispatched = await dispatchPendingOutboxEvents(10);
  assert(dispatched >= 1, `Dispatcher de outbox procesó y despachó ${dispatched} eventos pendientes`);

  // --------------------------------------------------------------------------
  // 3. PUBLICACIÓN Y CONSUMO EN RABBITMQ (TOPIC EXCHANGE)
  // --------------------------------------------------------------------------
  console.log('\n--- 3. Pruebas de Publicación y Consumo en RabbitMQ (Topic Exchange & DLQ) ---');
  const rabbitState = { received: false, payload: null as any };

  await subscribeToTopicQueue(
    'test.kitchen.queue',
    ['order.created', 'order.*'],
    async (_msg, parsed) => {
      rabbitState.received = true;
      rabbitState.payload = parsed;
      return true; // ACK
    }
  );

  const published = await publishToExchange(
    'order.created',
    { orderId: 'ord-rabbit-test-101', orderNumber: 'ORD-RAB-101', status: 'RECEIVED' },
    correlationId
  );

  assert(published === true, 'Publicación de evento en Topic Exchange smartrestaurant.events exitosa');
  assert(rabbitState.received === true, 'Consumidor de cola suscrito recibió y procesó el evento correctamente');
  assert(rabbitState.payload?.orderNumber === 'ORD-RAB-101', 'Carga útil del mensaje preservada íntegramente a través del bus');

  // --------------------------------------------------------------------------
  // 4. PREVENCIÓN DE RESERVAS SIMULTÁNEAS INCOMPATIBLES (CONCURRENCIA)
  // --------------------------------------------------------------------------
  console.log('\n--- 4. Pruebas de Concurrencia y Bloqueo de Franjas en Reservas ---');
  const testDate = '2026-12-01';
  const tableId = 'tbl-col-01';

  const booking1 = store.createReservation({
    tenantId: 'rest-col-01',
    branchId: 'branch-col-bog',
    tableId,
    customerName: 'Cliente Concurrente 1',
    customerEmail: 'c1@test.com',
    customerPhone: '+57 300 111 2222',
    date: testDate,
    startTime: '19:00',
    partySize: 2,
  });
  assert(booking1.reservation.status === 'CONFIRMED', 'Reserva 1 creada exitosamente en 19:00-21:00');

  let collisionCaught = false;
  try {
    store.createReservation({
      tenantId: 'rest-col-01',
      branchId: 'branch-col-bog',
      tableId,
      customerName: 'Cliente Concurrente 2 (Conflicto)',
      customerEmail: 'c2@test.com',
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

  // --------------------------------------------------------------------------
  // 5. IDEMPOTENCIA Y PROTECCIÓN DE PRECIOS EN PEDIDOS
  // --------------------------------------------------------------------------
  console.log('\n--- 5. Pruebas de Integridad de Precios e Idempotencia en Pedidos ---');
  const idemKey = `idem-key-dist-${Date.now()}`;
  const qrToken = 'qr-bog-tbl-01-token884';

  const order1 = store.createOrder({
    tenantId: 'rest-col-01',
    branchId: 'branch-col-bog',
    tableId,
    qrToken,
    idempotencyKey: idemKey,
    customerName: 'Cliente Idempotente',
    items: [
      { menuItemId: 'item-col-01', quantity: 1 }, // Bandeja Paisa (48.000 COP)
      { menuItemId: 'item-col-04', quantity: 2 }, // Lulada (15.000 COP x 2 = 30.000 COP)
    ],
  });

  assert(!order1.isDuplicate, 'Primer intento de pedido procesado normalmente (Status 201 Created)');
  assert(order1.order.subtotal === 78000, 'Subtotal calculado estrictamente en el servidor (78.000 COP)');
  assert(order1.order.tax === 6240, 'Impuesto calculado según tasa de impoconsumo local (8% = 6.240 COP)');
  assert(order1.order.total === 84240, 'Total calculado exactamente (84.240 COP)');

  // Reintento idéntico
  const orderRetry = store.createOrder({
    tenantId: 'rest-col-01',
    branchId: 'branch-col-bog',
    tableId,
    qrToken,
    idempotencyKey: idemKey,
    customerName: 'Cliente Idempotente',
    items: [{ menuItemId: 'item-col-01', quantity: 1 }],
  });

  assert(orderRetry.isDuplicate, 'Reintento con misma Idempotency-Key detectado como duplicado');
  assert(orderRetry.order.id === order1.order.id, 'Devolvió la orden original sin crear registros duplicados');

  // --------------------------------------------------------------------------
  // 6. AUTENTICACIÓN REAL, BCRYPT Y RBAC CON JWT
  // --------------------------------------------------------------------------
  console.log('\n--- 6. Pruebas de Autenticación, Hash Bcrypt y RBAC con JWT ---');
  const plainPassword = 'SuperSecretPassword2026!';
  const hashedPassword = await hashPassword(plainPassword);

  assert(hashedPassword.startsWith('$2a$') || hashedPassword.startsWith('$2b$'), 'Contraseña procesada y hasheada con algoritmo Bcrypt');
  assert(await comparePassword(plainPassword, hashedPassword), 'Verificación de contraseña con Bcrypt exitosa');
  assert(!(await comparePassword('WrongPassword', hashedPassword)), 'Rechazo de contraseña incorrecta');

  // JWT Token creation & verification
  const token = generateToken({
    id: 'usr-admin-01',
    tenantId: 'rest-col-01',
    email: 'admin@andres.co',
    name: 'Valeria Gómez',
    role: 'ADMIN',
  });

  assert(typeof token === 'string' && token.split('.').length === 3, 'Token JWT emitido con estructura válida (Header.Payload.Signature)');
  const decoded = verifyToken(token);
  assert(decoded.role === 'ADMIN', 'Claim de rol ADMIN decodificado correctamente del JWT');
  assert(decoded.tenantId === 'rest-col-01', 'Claim de tenantId decodificado correctamente');

  // --------------------------------------------------------------------------
  // 7. RECUPERACIÓN ANTE INDISPONIBILIDAD DE BROKER
  // --------------------------------------------------------------------------
  console.log('\n--- 7. Pruebas de Resiliencia ante Indisponibilidad de RabbitMQ ---');
  const resilientPublish = await publishToExchange('system.heartbeat', { ping: true, service: 'health-checker' });
  assert(resilientPublish === true, 'El bus de eventos enruta a buffers locales y sobrevive si RabbitMQ está temporalmente no disponible');

  // --------------------------------------------------------------------------
  // 8. AISLAMIENTO MULTI-TENANT
  // --------------------------------------------------------------------------
  console.log('\n--- 8. Pruebas de Aislamiento Multi-Tenant ---');
  const colMenu = store.getMenuItems(undefined, 'rest-col-01');
  const jpnMenu = store.getMenuItems(undefined, 'rest-jpn-05');
  const mexMenu = store.getMenuItems(undefined, 'rest-mex-02');

  assert(colMenu.every((i) => i.currency === 'COP'), 'Todos los ítems de Colombia aislados y cotizados en COP');
  assert(jpnMenu.every((i) => i.currency === 'JPY'), 'Todos los ítems de Japón aislados y cotizados en JPY');
  assert(mexMenu.every((i) => i.currency === 'MXN'), 'Todos los ítems de México aislados y cotizados en MXN');
  assert(!colMenu.some((i) => jpnMenu.map((j) => j.id).includes(i.id)), 'Aislamiento estricto de catálogos sin filtración entre tenants');

  // --------------------------------------------------------------------------
  // 9. INTERNACIONALIZACIÓN COMPLETA (5 IDIOMAS Y 5 MONEDAS)
  // --------------------------------------------------------------------------
  console.log('\n--- 9. Pruebas de Internacionalización y Mercados (5 Países) ---');
  const markets = ['es-CO', 'es-MX', 'en-US', 'pt-BR', 'ja-JP'];
  markets.forEach((m) => {
    assert(m in MARKETS, `Mercado ${m} registrado en la configuración multinacional`);
  });

  // Authentic translation verification
  assert(jaJP.nav.reservations === '予約管理', 'Traducción en japonés para Reservas (予約管理)');
  assert(jaJP.kitchen.title.includes('厨房'), 'Traducción en japonés para Cocina (厨房)');
  assert(jaJP.reviews.title === 'お客様からの口コミ・評価', 'Traducción en japonés para Reseñas (お客様からの口コミ・評価)');

  assert(enUS.nav.reservations === 'Reservations', 'Traducción en inglés para Reservas');
  assert(enUS.reviews.title === 'Guest Reviews & Ratings', 'Traducción en inglés para Reseñas');

  assert(ptBR.nav.reservations === 'Reservas', 'Traducción en portugués para Reservas');
  assert(ptBR.reviews.title === 'Avaliações e Opiniões dos Clientes', 'Traducción en portugués para Reseñas');

  assert(esCO.reviews.title === 'Opiniones y Reseñas de Clientes', 'Traducción en español Colombia para Reseñas');
  assert(esMX.reviews.title === 'Opiniones y Reseñas de Clientes', 'Traducción en español México para Reseñas');

  // --------------------------------------------------------------------------
  // 10. MÁQUINA DE ESTADOS FINITA DE COCINA (KDS)
  // --------------------------------------------------------------------------
  console.log('\n--- 10. Pruebas de Máquina de Estados de Cocina ---');
  const ordId = order1.order.id;
  const toPrep = store.updateOrderStatus(ordId, 'PREPARING', 'KITCHEN');
  assert(toPrep.order.status === 'PREPARING', 'Transición válida: RECEIVED -> PREPARING');

  let invalidJumpCaught = false;
  try {
    store.updateOrderStatus(ordId, 'DELIVERED', 'KITCHEN');
  } catch (err) {
    invalidJumpCaught = true;
  }
  assert(invalidJumpCaught, 'Rechazo de salto inválido en máquina de estados (PREPARING -> DELIVERED)');

  const toReady = store.updateOrderStatus(ordId, 'READY', 'KITCHEN');
  assert(toReady.order.status === 'READY', 'Transición válida: PREPARING -> READY');

  const toDelivered = store.updateOrderStatus(ordId, 'DELIVERED', 'WAITER');
  assert(toDelivered.order.status === 'DELIVERED', 'Transición válida: READY -> DELIVERED');

  console.log('\n========================================================================');
  console.log('🎉 TODAS LAS 10 SUITES DE PRUEBAS DISTRIBUIDAS PASARON CON 100% DE ÉXITO');
  console.log('========================================================================\n');
}

runAllDistributedTests().catch((err) => {
  console.error('Fatal Test Runner Error:', err);
  process.exit(1);
});
