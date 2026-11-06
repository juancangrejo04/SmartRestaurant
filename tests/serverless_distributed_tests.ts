// Suite Integral de Pruebas de Integración — SmartRestaurant Serverless Architecture
// (Vercel Serverless Functions + Supabase PostgreSQL & Auth + Upstash QStash)
import { strict as assert } from 'assert';
import express from 'express';
import { authApp } from '../services/auth-service';
import { reservationApp } from '../services/reservation-service';
import { orderApp } from '../services/order-service';
import { kitchenApp } from '../services/kitchen-service';
import { restaurantApp } from '../services/restaurant-service';
import { setTestDb } from '../services/common/db';
import { stageOutboxEvent, dispatchPendingOutboxEvents } from '../services/common/outbox';
import {
  publishToQStash,
  processQStashIncomingEvent,
  setTestQStashPublisher,
  QStashEventEnvelope,
} from '../services/common/qstash';
import qstashReceiverHandler from '../api/events/qstash-receiver';
import { MARKETS } from '../src/i18n/i18nContext';
import { esCO } from '../src/i18n/locales/es-CO';
import { esMX } from '../src/i18n/locales/es-MX';
import { enUS } from '../src/i18n/locales/en-US';
import { ptBR } from '../src/i18n/locales/pt-BR';
import { jaJP } from '../src/i18n/locales/ja-JP';

// Helper to execute Express handlers in integration tests
function requestApp(
  app: any,
  method: string,
  path: string,
  options: { body?: any; headers?: Record<string, string>; query?: any } = {}
): Promise<{ status: number; body: any; headers: Record<string, string> }> {
  return new Promise((resolve) => {
    const [pathOnly, queryString] = path.split('?');
    const queryParams: Record<string, any> = { ...(options.query || {}) };
    if (queryString) {
      const sp = new URLSearchParams(queryString);
      sp.forEach((v, k) => {
        queryParams[k] = v;
      });
    }

    const reqHeaders: Record<string, string> = {};
    if (options.headers) {
      for (const [k, v] of Object.entries(options.headers)) {
        reqHeaders[k.toLowerCase()] = v;
      }
    }

    const req: any = {
      method,
      url: path,
      path: pathOnly,
      params: {},
      headers: reqHeaders,
      body: options.body || {},
      query: queryParams,
      getHeader: (name: string) => reqHeaders[name.toLowerCase()],
    };

    let responseStatus = 200;
    const responseHeaders: Record<string, string> = {};

    const res: any = {
      statusCode: 200,
      status: (code: number) => {
        responseStatus = code;
        res.statusCode = code;
        return res;
      },
      setHeader: (key: string, val: string) => {
        responseHeaders[key.toLowerCase()] = val;
        return res;
      },
      getHeader: (key: string) => responseHeaders[key.toLowerCase()],
      json: (data: any) => {
        resolve({ status: responseStatus, body: data, headers: responseHeaders });
      },
      send: (data: any) => {
        resolve({ status: responseStatus, body: data, headers: responseHeaders });
      },
    };

    app(req, res);
  });
}

async function runServerlessDistributedTests() {
  console.log('\n========================================================================');
  console.log('🚀 EJECUTANDO SUITE COMPLETA DE PRUEBAS SERVERLESS — SMARTRESTAURANT');
  console.log('Arquitectura: Vercel Functions + Supabase PostgreSQL & Auth + Upstash QStash');
  console.log('========================================================================\n');

  // Setup In-Memory Test Supabase Client simulating full PostgreSQL tables and Supabase Auth
  const mockDbData: Record<string, any[]> = {
    tenants: [
      { id: 'rest-col-01', name: 'Andrés Restaurante & Asador', cuisine_type: 'Colombiana' },
      { id: 'rest-jpn-05', name: 'Kaede Kyoto', cuisine_type: 'Japonesa' },
    ],
    branches: [
      { id: 'branch-col-bog', tenant_id: 'rest-col-01', name: 'Bogotá', commercial_currency: 'COP' },
      { id: 'branch-jpn-tok', tenant_id: 'rest-jpn-05', name: 'Tokyo', commercial_currency: 'JPY' },
    ],
    restaurant_tables: [
      { id: 'tbl-col-01', tenant_id: 'rest-col-01', branch_id: 'branch-col-bog', table_number: 1, qr_token: 'qr-col-01' },
      { id: 'tbl-jpn-01', tenant_id: 'rest-jpn-05', branch_id: 'branch-jpn-tok', table_number: 1, qr_token: 'qr-jpn-01' },
    ],
    menu_items: [
      { id: 'item-col-01', tenant_id: 'rest-col-01', name_translations: { 'es-CO': 'Bandeja Paisa' }, price: 48000, currency: 'COP', is_available: true },
      { id: 'item-col-04', tenant_id: 'rest-col-01', name_translations: { 'es-CO': 'Lulada Valluna' }, price: 15000, currency: 'COP', is_available: true },
      { id: 'item-jpn-01', tenant_id: 'rest-jpn-05', name_translations: { 'ja-JP': '特選 懐石料理コース' }, price: 18000, currency: 'JPY', is_available: true },
    ],
    users: [],
    reservations: [],
    orders: [],
    order_items: [],
    order_status_history: [],
    notifications: [],
    outbox_events: [],
    processed_events: [],
  };

  const authUsers: Map<string, { id: string; email: string; password: string; metadata: any }> = new Map();
  const authTokens: Map<string, string> = new Map(); // token -> userId

  const testSupabase = {
    auth: {
      signUp: async ({ email, password, options }: any) => {
        const cleanEmail = email.toLowerCase().trim();
        if (authUsers.has(cleanEmail)) {
          return { data: { user: null, session: null }, error: { message: 'User already registered.' } };
        }
        const userId = `usr-sb-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
        const userObj = {
          id: userId,
          email: cleanEmail,
          password,
          user_metadata: options?.data || {},
        };
        authUsers.set(cleanEmail, { id: userId, email: cleanEmail, password, metadata: options?.data || {} });
        const token = `sb-token-${userId}-${Date.now()}`;
        authTokens.set(token, userId);
        return {
          data: {
            user: userObj,
            session: { access_token: token, refresh_token: `ref-${token}`, expires_in: 3600 },
          },
          error: null,
        };
      },
      signInWithPassword: async ({ email, password }: any) => {
        const cleanEmail = email.toLowerCase().trim();
        const existing = authUsers.get(cleanEmail);
        if (!existing || existing.password !== password) {
          return { data: { user: null, session: null }, error: { message: 'Invalid login credentials' } };
        }
        const token = `sb-token-${existing.id}-${Date.now()}`;
        authTokens.set(token, existing.id);
        return {
          data: {
            user: { id: existing.id, email: existing.email, user_metadata: existing.metadata },
            session: { access_token: token, refresh_token: `ref-${token}`, expires_in: 3600 },
          },
          error: null,
        };
      },
      resetPasswordForEmail: async (email: string) => {
        const cleanEmail = email.toLowerCase().trim();
        if (!authUsers.has(cleanEmail)) {
          return { error: { message: 'User not found' } };
        }
        return { error: null };
      },
      signOut: async () => ({ error: null }),
      getUser: async (token: string) => {
        const userId = authTokens.get(token);
        if (!userId) {
          return { data: { user: null }, error: { message: 'Invalid or expired Supabase token' } };
        }
        const found = Array.from(authUsers.values()).find((u) => u.id === userId);
        if (!found) {
          return { data: { user: null }, error: { message: 'User record not found' } };
        }
        return {
          data: { user: { id: found.id, email: found.email, user_metadata: found.metadata } },
          error: null,
        };
      },
    },
    rpc: async (fnName: string, params: any) => {
      if (fnName === 'claim_outbox_events') {
        const batchSize = params.p_batch_size || 20;
        const workerId = params.p_worker_id;
        const now = new Date().toISOString();
        const events = mockDbData['outbox_events'] || [];
        const claimed: any[] = [];

        for (const evt of events) {
          if ((evt.status === 'PENDING' || evt.status === 'FAILED') && claimed.length < batchSize) {
            evt.status = 'PROCESSING';
            evt.worker_id = workerId;
            evt.locked_at = now;
            claimed.push({ ...evt });
          }
        }
        return { data: claimed, error: null };
      }
      return { data: null, error: { message: `Unknown RPC ${fnName}` } };
    },
    from: (table: string) => {
      let filters: Array<(row: any) => boolean> = [];
      let sortField: string | null = null;
      let sortAsc = true;
      let limitCount: number | null = null;

      const builder: any = {
        select: () => builder,
        eq: (field: string, val: any) => {
          filters.push((r) => r[field] === val);
          return builder;
        },
        neq: (field: string, val: any) => {
          filters.push((r) => r[field] !== val);
          return builder;
        },
        not: (field: string, op: string, val: string) => {
          if (op === 'in') {
            const forbidden = val.replace(/[()"]/g, '').split(',');
            filters.push((r) => !forbidden.includes(r[field]));
          }
          return builder;
        },
        in: (field: string, values: any[]) => {
          filters.push((r) => values.includes(r[field]));
          return builder;
        },
        order: (field: string, opts?: { ascending?: boolean }) => {
          sortField = field;
          sortAsc = opts?.ascending ?? true;
          return builder;
        },
        limit: (n: number) => {
          limitCount = n;
          return builder;
        },
        maybeSingle: async () => {
          let rows = mockDbData[table] || [];
          for (const f of filters) rows = rows.filter(f);
          return { data: rows[0] || null, error: null };
        },
        single: async () => {
          let rows = mockDbData[table] || [];
          for (const f of filters) rows = rows.filter(f);
          return { data: rows[0] || null, error: null };
        },
        then: (resolve: any, reject?: any) => {
          let rows = [...(mockDbData[table] || [])];
          for (const f of filters) rows = rows.filter(f);
          if (sortField) {
            rows.sort((a, b) => {
              if (a[sortField!] < b[sortField!]) return sortAsc ? -1 : 1;
              if (a[sortField!] > b[sortField!]) return sortAsc ? 1 : -1;
              return 0;
            });
          }
          if (limitCount !== null) {
            rows = rows.slice(0, limitCount);
          }
          return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
        },
        insert: (data: any) => {
          const toInsert = Array.isArray(data) ? data : [data];
          if (!mockDbData[table]) mockDbData[table] = [];

          let uniqueErr: any = null;
          if (table === 'processed_events') {
            for (const item of toInsert) {
              if (mockDbData[table].some((r) => r.event_id === item.event_id)) {
                uniqueErr = { code: '23505', message: 'duplicate key value violates unique constraint' };
                break;
              }
            }
          }

          if (!uniqueErr) {
            mockDbData[table].push(...toInsert);
          }

          const resObj = {
            data: uniqueErr ? null : toInsert,
            error: uniqueErr,
            select: () => ({
              single: async () => ({ data: uniqueErr ? null : toInsert[0], error: uniqueErr }),
              maybeSingle: async () => ({ data: uniqueErr ? null : toInsert[0], error: uniqueErr }),
            }),
          };

          return Object.assign(Promise.resolve(resObj), resObj);
        },
        upsert: async (data: any) => {
          if (!mockDbData[table]) mockDbData[table] = [];
          const idx = mockDbData[table].findIndex((r) => r.id === data.id);
          if (idx >= 0) {
            mockDbData[table][idx] = { ...mockDbData[table][idx], ...data };
          } else {
            mockDbData[table].push(data);
          }
          return { data, error: null };
        },
        update: (fields: any) => ({
          eq: (field1: string, val1: any) => {
            const updateFilter = (r: any) => r[field1] === val1;
            const applyUpdate = () => {
              let updatedRow: any = null;
              if (mockDbData[table]) {
                for (const r of mockDbData[table]) {
                  if (updateFilter(r)) {
                    Object.assign(r, fields);
                    updatedRow = r;
                  }
                }
              }
              return updatedRow;
            };

            const subBuilder: any = {
              eq: (field2: string, val2: any) => {
                let updatedRow: any = null;
                if (mockDbData[table]) {
                  for (const r of mockDbData[table]) {
                    if (r[field1] === val1 && r[field2] === val2) {
                      Object.assign(r, fields);
                      updatedRow = r;
                    }
                  }
                }
                return {
                  select: () => ({
                    maybeSingle: async () => ({ data: updatedRow, error: null }),
                    single: async () => ({ data: updatedRow, error: null }),
                  }),
                  then: (resolve: any) => Promise.resolve({ data: updatedRow, error: null }).then(resolve),
                };
              },
              select: () => ({
                single: async () => ({ data: applyUpdate(), error: null }),
                maybeSingle: async () => ({ data: applyUpdate(), error: null }),
              }),
              then: (resolve: any) => Promise.resolve({ data: applyUpdate(), error: null }).then(resolve),
            };

            return subBuilder;
          },
        }),
      };
      return builder;
    },
  };

  setTestDb(testSupabase);
  setTestQStashPublisher(async (envelope) => {
    return { success: true, messageId: `msg-test-${envelope.eventId}` };
  });

  // --------------------------------------------------------------------------
  // TEST SUITE 1: SEGURIDAD DE AUTENTICACIÓN Y ROLES (RBAC & TENANT)
  // --------------------------------------------------------------------------
  console.log('--- 1. Validación de Token con Supabase Auth y Reglas de Seguridad ---');

  // Test Case 1.1: Usuario sin perfil en tabla users -> 403 Forbidden
  console.log('Test 1: Usuario autenticado sin perfil en users -> 403 Forbidden');
  const orphanAuth = await testSupabase.auth.signUp({
    email: 'orphan.user@smartrestaurant.co',
    password: 'SecurePassword2026!',
    options: { data: { role: 'ADMIN', tenantId: 'rest-col-01' } },
  });
  const orphanToken = orphanAuth.data.session!.access_token;

  const orphanReq = await requestApp(authApp, 'GET', '/me', {
    headers: { Authorization: `Bearer ${orphanToken}` },
  });
  assert.equal(orphanReq.status, 403, 'Rechazo con código 403 para usuario sin perfil');
  assert.equal(orphanReq.body.error.code, 'PROFILE_NOT_FOUND', 'Código PROFILE_NOT_FOUND devuelto');
  console.log('✅ [TEST 1 PASS]: Usuario sin perfil en la base de datos es rechazado con 403.');

  // Test Case 1.2: Usuario con perfil pero tenant_id nulo o inválido -> 403 Forbidden
  console.log('Test 2: Usuario con tenant_id nulo/inválido -> 403 Forbidden');
  const invalidTenantAuth = await testSupabase.auth.signUp({
    email: 'no.tenant@smartrestaurant.co',
    password: 'SecurePassword2026!',
    options: {},
  });
  const invalidTenantToken = invalidTenantAuth.data.session!.access_token;
  const invalidTenantUserId = invalidTenantAuth.data.user!.id;

  // Insert profile with invalid tenant_id
  mockDbData['users'].push({
    id: invalidTenantUserId,
    tenant_id: '   ', // blank
    name: 'Usuario Sin Restaurante',
    email: 'no.tenant@smartrestaurant.co',
    role: 'ADMIN',
  });

  const invalidTenantReq = await requestApp(authApp, 'GET', '/me', {
    headers: { Authorization: `Bearer ${invalidTenantToken}` },
  });
  assert.equal(invalidTenantReq.status, 403, 'Rechazo con código 403 ante tenant_id inválido');
  assert.equal(invalidTenantReq.body.error.code, 'INVALID_TENANT', 'Código INVALID_TENANT devuelto');
  console.log('✅ [TEST 2 PASS]: Usuario con tenant_id inválido es rechazado con 403.');

  // Test Case 1.3: Registro e inicio de sesión legítimo con Supabase Auth
  console.log('Test 3: Registro y Login legítimo con Supabase Auth');
  const regChef = await requestApp(authApp, 'POST', '/register', {
    body: {
      name: 'Chef Santiago Gómez',
      email: 'santiago.chef@smartrestaurant.co',
      password: 'RealSecurePassword2026!',
      role: 'KITCHEN',
      tenantId: 'rest-col-01',
      branchId: 'branch-col-bog',
    },
  });
  assert.equal(regChef.status, 201, 'Registro exitoso con código 201');
  const kitchenToken = regChef.body.token;

  // Verify that users table contains NO password_hash
  const chefProfile = mockDbData['users'].find((u) => u.email === 'santiago.chef@smartrestaurant.co');
  assert(chefProfile && !('password_hash' in chefProfile), 'Seguridad garantizada: tabla users no tiene password_hash');

  // Register an Admin from Japan
  const regAdminJpn = await requestApp(authApp, 'POST', '/register', {
    body: {
      name: 'Kenji Takahashi',
      email: 'kenji.tokyo@smartrestaurant.jp',
      password: 'TokyoSecurePass2026!',
      role: 'ADMIN',
      tenantId: 'rest-jpn-05',
      branchId: 'branch-jpn-tok',
    },
  });
  const jpnAdminToken = regAdminJpn.body.token;

  // Register a Waiter from Colombia
  const regWaiterCol = await requestApp(authApp, 'POST', '/register', {
    body: {
      name: 'Santiago Rivas Mesero',
      email: 'santiago.mesero@smartrestaurant.co',
      password: 'WaiterSecurePass2026!',
      role: 'WAITER',
      tenantId: 'rest-col-01',
      branchId: 'branch-col-bog',
    },
  });
  const colWaiterToken = regWaiterCol.body.token;
  console.log('✅ [TEST 3 PASS]: Usuarios legítimos registrados con perfiles persistidos en Supabase.');

  // --------------------------------------------------------------------------
  // TEST SUITE 2: CREACIÓN DE PEDIDOS CON VALIDACIÓN QR Y PRECIOS DEL SERVIDOR
  // --------------------------------------------------------------------------
  console.log('\n--- 2. Creación de Pedidos con QR Token y Precios del Servidor ---');

  // Test Case 4: QR token válido -> 201 Created y resolución de datos en servidor
  console.log('Test 4: Pedido con QR token válido -> 201 Created');
  const validQrIdemKey = `idem-valid-qr-${Date.now()}`;
  const validQrRes = await requestApp(orderApp, 'POST', '/orders', {
    headers: { 'idempotency-key': validQrIdemKey },
    body: {
      qrToken: 'qr-col-01', // Corresponds to tbl-col-01, rest-col-01, branch-col-bog, table 1
      customerName: 'Cliente Mesa 1',
      items: [{ menuItemId: 'item-col-01', quantity: 2 }],
    },
  });
  assert.equal(validQrRes.status, 201, 'Pedido con QR válido retorna 201');
  assert.equal(validQrRes.body.data.tenantId, 'rest-col-01', 'tenantId resuelto desde el registro de la mesa');
  assert.equal(validQrRes.body.data.branchId, 'branch-col-bog', 'branchId resuelto desde el registro de la mesa');
  assert.equal(validQrRes.body.data.tableNumber, 1, 'tableNumber resuelto desde el registro de la mesa');
  assert.equal(validQrRes.body.data.subtotal, 96000, 'Subtotal: 48.000 x 2 = 96.000 COP');
  const createdOrderId = validQrRes.body.data.id;
  console.log('✅ [TEST 4 PASS]: Pedido con QR válido creado exitosamente con resolución del servidor.');

  // Test Case 5: QR token manipulado o inexistente -> 400 Bad Request
  console.log('Test 5: Pedido con QR token manipulado -> 400 Bad Request');
  const fakeQrRes = await requestApp(orderApp, 'POST', '/orders', {
    headers: { 'idempotency-key': `idem-fake-qr-${Date.now()}` },
    body: {
      qrToken: 'qr-hacked-fake-token',
      items: [{ menuItemId: 'item-col-01', quantity: 1 }],
    },
  });
  assert.equal(fakeQrRes.status, 400, 'Rechazo de QR inexistente con código 400');
  assert.equal(fakeQrRes.body.error.code, 'INVALID_QR_TOKEN', 'Código INVALID_QR_TOKEN devuelto');
  console.log('✅ [TEST 5 PASS]: QR manipulado rechazado estrictamente.');

  // Test Case 6: Precios manipulados por el cliente en el body -> Servidor sobrescribe con menu_items
  console.log('Test 6: Precios manipulados por el cliente -> Servidor impone precios reales');
  const hackedPriceIdemKey = `idem-hacked-price-${Date.now()}`;
  const priceHackRes = await requestApp(orderApp, 'POST', '/orders', {
    headers: { 'idempotency-key': hackedPriceIdemKey },
    body: {
      qrToken: 'qr-col-01',
      customerName: 'Atacante Precio Cero',
      items: [
        {
          menuItemId: 'item-col-01', // Real price is 48.000
          unitPrice: 1, // Manipulated price: 1 COP
          quantity: 1,
        },
      ],
    },
  });
  assert.equal(priceHackRes.status, 201, 'Pedido procesado');
  assert.equal(priceHackRes.body.data.subtotal, 48000, 'Servidor ignoró unitPrice: 1 y cobró 48.000 COP');
  console.log('✅ [TEST 6 PASS]: El servidor impone estrictamente los precios de menu_items.');

  // Test Case 7: Productos pertenecientes a otro tenant (Cross-tenant items) -> 400 Bad Request
  console.log('Test 7: Inyección de platos cross-tenant -> 400 Bad Request');
  const crossTenantOrderRes = await requestApp(orderApp, 'POST', '/orders', {
    headers: { 'idempotency-key': `idem-cross-tenant-${Date.now()}` },
    body: {
      qrToken: 'qr-col-01', // Colombia mesa
      customerName: 'Atacante Cross Tenant',
      items: [
        { menuItemId: 'item-jpn-01', quantity: 1 }, // Plato de Japón (rest-jpn-05) en mesa de Colombia
      ],
    },
  });
  assert.equal(crossTenantOrderRes.status, 400, 'Rechazo de plato cross-tenant con 400');
  assert.equal(crossTenantOrderRes.body.error.code, 'CROSS_TENANT_ITEM_FORBIDDEN', 'Código CROSS_TENANT_ITEM_FORBIDDEN');
  console.log('✅ [TEST 7 PASS]: Detección y rechazo de productos cross-tenant verificado.');

  // --------------------------------------------------------------------------
  // TEST SUITE 3: EVENTOS QSTASH, NOTIFICACIONES Y MÁQUINA DE ESTADOS
  // --------------------------------------------------------------------------
  console.log('\n--- 3. Eventos QStash, Notificaciones y Máquina de Estados ---');

  // Test Case 8: Evento OrderCreated genera notificación real para rol KITCHEN
  console.log('Test 8: Evento OrderCreated genera notificación para Cocina en PostgreSQL');
  const envelopeOrderCreated: QStashEventEnvelope = {
    eventId: `evt-order-created-${Date.now()}`,
    eventType: 'OrderCreated',
    topic: 'smartrestaurant.ordercreated',
    correlationId: `corr-ord-${Date.now()}`,
    tenantId: 'rest-col-01',
    branchId: 'branch-col-bog',
    timestamp: new Date().toISOString(),
    payload: {
      orderId: createdOrderId,
      orderNumber: 'ORD-TEST-001',
      tableNumber: 1,
      itemsCount: 2,
      total: 96000,
      currency: 'COP',
    },
  };
  const eventResult1 = await processQStashIncomingEvent(envelopeOrderCreated);
  assert(eventResult1.success && !eventResult1.isDuplicate, 'Evento OrderCreated procesado');
  const kitchenNotifications = mockDbData['notifications'].filter(
    (n) => n.recipient_role === 'KITCHEN' && n.tenant_id === 'rest-col-01'
  );
  assert(kitchenNotifications.length > 0, 'Notificación para personal de cocina persistida en BD');
  console.log('✅ [TEST 8 PASS]: Notificación para Cocina insertada exitosamente ante OrderCreated.');

  // Test Case 9: Idempotencia persistente en processed_events ante entrega duplicada
  console.log('Test 9: Deduplicación e Idempotencia en processed_events');
  const duplicateResult = await processQStashIncomingEvent(envelopeOrderCreated);
  assert(duplicateResult.success && duplicateResult.isDuplicate, 'Entrega repetida marcada como duplicada');
  assert.deepEqual(duplicateResult.handlersRun, ['IDEMPOTENT_SKIPPED'], 'Manejadores omitidos por idempotencia');
  console.log('✅ [TEST 9 PASS]: Re-entrega duplicada detectada e ignorada en processed_events.');

  // Test Case 10: Evento marcado como PROCESSED al finalizar exitosamente
  console.log('Test 10: Evento completado marcado con estado PROCESSED');
  const processedRow = mockDbData['processed_events'].find((e) => e.event_id === envelopeOrderCreated.eventId);
  assert(processedRow && processedRow.status === 'PROCESSED', 'Estado en BD es PROCESSED');
  assert(processedRow.processed_at, 'Fecha processed_at registrada');
  console.log('✅ [TEST 10 PASS]: Evento completado registrado como PROCESSED en Supabase.');

  // Test Case 11: Reintento ante fallo (no se marca PROCESSED prematuramente)
  console.log('Test 11: Evento fallido se marca como FAILED para permitir reintentos futuros');
  const failingEnvelope: QStashEventEnvelope = {
    eventId: `evt-failing-${Date.now()}`,
    eventType: 'ReservationCancelled',
    topic: 'smartrestaurant.reservationcancelled',
    correlationId: `corr-fail-${Date.now()}`,
    tenantId: 'rest-col-01',
    timestamp: new Date().toISOString(),
    payload: null, // Causará un error deliberado o prueba de fallo
  };

  // Simular un fallo inyectando una excepción en el manejador
  const origPush = mockDbData['notifications'].push.bind(mockDbData['notifications']);
  let simulatedFailureTriggered = false;
  mockDbData['notifications'].push = function (...items: any[]) {
    if (!simulatedFailureTriggered) {
      simulatedFailureTriggered = true;
      throw new Error('Database network timeout simulation');
    }
    return origPush(...items);
  };

  try {
    await processQStashIncomingEvent(failingEnvelope);
    assert.fail('Debió lanzar excepción');
  } catch (err: any) {
    assert(err.message.includes('timeout'), 'Error capturado');
  }

  // Verificar que en processed_events el estado sea FAILED y NO PROCESSED
  const failedEventRow = mockDbData['processed_events'].find((e) => e.event_id === failingEnvelope.eventId);
  assert(failedEventRow, 'Registro de evento persistido');
  assert.equal(failedEventRow.status, 'FAILED', 'Estado es FAILED tras error');

  // Ahora el reintento exitoso (simulando re-entrega de QStash)
  const retryResult = await processQStashIncomingEvent(failingEnvelope);
  assert(retryResult.success, 'Reintento completado');
  assert.equal(failedEventRow.status, 'PROCESSED', 'Estado transiciona a PROCESSED tras recuperación');
  mockDbData['notifications'].push = origPush;
  console.log('✅ [TEST 11 PASS]: Manejo de fallos y reintentos sin marcación prematura de PROCESSED verificado.');

  // Test Case 12: Despacho concurrente de Outbox con bloqueo atómico (SKIP LOCKED)
  console.log('Test 12: Concurrencia en Transactional Outbox (Dos workers simultáneos)');
  // Crear 4 eventos outbox en PENDING
  const outboxEvt1 = await stageOutboxEvent({
    aggregateType: 'Order',
    aggregateId: createdOrderId,
    eventType: 'OrderCreated',
    tenantId: 'rest-col-01',
    correlationId: `corr-c1-${Date.now()}`,
    payload: { test: 1 },
  });
  const outboxEvt2 = await stageOutboxEvent({
    aggregateType: 'Order',
    aggregateId: createdOrderId,
    eventType: 'OrderCreated',
    tenantId: 'rest-col-01',
    correlationId: `corr-c2-${Date.now()}`,
    payload: { test: 2 },
  });

  // Contar eventos pendientes acumulados en outbox_events
  const pendingCountBefore = mockDbData['outbox_events'].filter((e) => e.status === 'PENDING').length;
  assert(pendingCountBefore >= 2, 'Hay al menos dos eventos outbox pendientes');

  // Ejecutar dos workers concurrentes
  const [worker1Result, worker2Result] = await Promise.all([
    dispatchPendingOutboxEvents(10, 'worker-A'),
    dispatchPendingOutboxEvents(10, 'worker-B'),
  ]);

  // Ningún evento debe haber sido procesado dos veces ni omitido
  const totalDispatched = worker1Result + worker2Result;
  assert.equal(totalDispatched, pendingCountBefore, `Los dos workers despacharon exactamente ${pendingCountBefore} eventos sin duplicación`);
  const remainingUnprocessed = mockDbData['outbox_events'].filter((e) => e.status === 'PENDING' || e.status === 'PROCESSING');
  assert.equal(remainingUnprocessed.length, 0, 'Ningún evento quedó bloqueado o sin despachar');
  console.log('✅ [TEST 12 PASS]: Concurrencia atómica de Outbox previene doble despacho entre workers.');

  // Test Case 13: Verificación criptográfica de firma QStash inválida -> 401 Unauthorized
  console.log('Test 13: Webhook con firma QStash inválida o falsificada -> 401 Unauthorized');
  const receiverApp = express();
  receiverApp.post('/api/events/qstash-receiver', qstashReceiverHandler);

  const fakeSigRes = await requestApp(receiverApp, 'POST', '/api/events/qstash-receiver', {
    headers: { 'upstash-signature': 'forged-invalid-hmac-signature' },
    body: { eventId: 'fake-evt', eventType: 'OrderCreated' },
  });
  assert.equal(fakeSigRes.status, 401, 'Rechazo con código 401 Unauthorized');
  assert.equal(fakeSigRes.body.error.code, 'UNAUTHORIZED_SIGNATURE', 'Código UNAUTHORIZED_SIGNATURE');
  console.log('✅ [TEST 13 PASS]: Firma criptográfica inválida rechazada con 401.');

  // --------------------------------------------------------------------------
  // TEST SUITE 4: MÁQUINA DE ESTADOS KDS Y REGLAS DE ROLES
  // --------------------------------------------------------------------------
  console.log('\n--- 4. Máquina de Estados de Cocina y Transiciones Autorizadas ---');
  // Transition: RECEIVED -> PREPARING por Cocina
  const toPrep = await requestApp(kitchenApp, 'PATCH', `/orders/${createdOrderId}/status`, {
    headers: { Authorization: `Bearer ${kitchenToken}` },
    body: { status: 'PREPARING' },
  });
  assert.equal(toPrep.status, 200, 'Cocina cambia a PREPARING exitosamente');

  // Jump ilegal: RECEIVED/PREPARING -> DELIVERED por Cocina -> 400 o 403
  const illegalJump = await requestApp(kitchenApp, 'PATCH', `/orders/${createdOrderId}/status`, {
    headers: { Authorization: `Bearer ${kitchenToken}` },
    body: { status: 'DELIVERED' }, // Cocina no puede marcar entregado
  });
  assert(illegalJump.status === 400 || illegalJump.status === 403, 'Rechazo de transición inválida');

  // Cocina marca READY
  const toReady = await requestApp(kitchenApp, 'PATCH', `/orders/${createdOrderId}/status`, {
    headers: { Authorization: `Bearer ${kitchenToken}` },
    body: { status: 'READY' },
  });
  assert.equal(toReady.status, 200, 'Cocina marca READY');

  // Mesero marca DELIVERED
  const toDelivered = await requestApp(kitchenApp, 'PATCH', `/orders/${createdOrderId}/status`, {
    headers: { Authorization: `Bearer ${colWaiterToken}` },
    body: { status: 'DELIVERED' },
  });
  assert.equal(toDelivered.status, 200, 'Mesero marca DELIVERED');
  console.log('✅ [PASS]: Máquina de estados de cocina y control de roles completados.');

  // --------------------------------------------------------------------------
  // TEST SUITE 5: AISLAMIENTO MULTI-TENANT (COLOMBIA VS. JAPÓN)
  // --------------------------------------------------------------------------
  console.log('\n--- 5. Aislamiento Multi-Tenant Estricto (Colombia vs. Japón) ---');
  const jpnOrderId = 'ord-jpn-live-001';
  mockDbData['orders'].push({
    id: jpnOrderId,
    tenant_id: 'rest-jpn-05',
    branch_id: 'branch-jpn-tok',
    table_id: 'tbl-jpn-01',
    table_number: 1,
    order_number: 'ORD-JPN-001',
    customer_name: 'Hiroshi Sato',
    status: 'RECEIVED',
    subtotal: 18000,
    tax: 1800,
    total: 19800,
    currency: 'JPY',
    idempotency_key: 'idem-jpn-001',
    created_at: new Date().toISOString(),
  });

  // Cocinero de Colombia intenta mutar pedido de Japón
  const crossTenantMutate = await requestApp(kitchenApp, 'PATCH', `/orders/${jpnOrderId}/status`, {
    headers: { Authorization: `Bearer ${kitchenToken}` },
    body: { status: 'PREPARING' },
  });
  assert.equal(crossTenantMutate.status, 403, 'Rechazo 403 Forbidden ante intento cross-tenant');
  assert.equal(crossTenantMutate.body.error.code, 'TENANT_MISMATCH', 'Código TENANT_MISMATCH');

  // Admin de Japón muta pedido de Japón
  const validTenantMutate = await requestApp(kitchenApp, 'PATCH', `/orders/${jpnOrderId}/status`, {
    headers: { Authorization: `Bearer ${jpnAdminToken}` },
    body: { status: 'PREPARING' },
  });
  assert.equal(validTenantMutate.status, 200, 'Operación autorizada dentro del tenant');
  console.log('✅ [PASS]: Aislamiento multi-tenant garantizado: Colombia no puede mutar pedidos de Japón.');

  // --------------------------------------------------------------------------
  // TEST SUITE 6: PERSISTENCIA ACID DE RESERVAS Y COLISIÓN DE HORARIOS (409)
  // --------------------------------------------------------------------------
  console.log('\n--- 6. Persistencia de Reservas y Prevención de Solapamientos (409) ---');
  const res1 = await requestApp(reservationApp, 'POST', '/reservations', {
    body: {
      tenantId: 'rest-col-01',
      branchId: 'branch-col-bog',
      tableId: 'tbl-col-01',
      customerName: 'Comensal Reserva A',
      customerEmail: 'comensal.a@test.com',
      date: '2026-12-31',
      startTime: '20:00',
      partySize: 4,
    },
  });
  assert.equal(res1.status, 201, 'Reserva 1 creada exitosamente');

  // Intento de solapamiento en la misma mesa física a las 20:30
  const res2 = await requestApp(reservationApp, 'POST', '/reservations', {
    body: {
      tenantId: 'rest-col-01',
      branchId: 'branch-col-bog',
      tableId: 'tbl-col-01',
      customerName: 'Comensal Reserva B (Conflicto)',
      customerEmail: 'comensal.b@test.com',
      date: '2026-12-31',
      startTime: '20:30',
      partySize: 2,
    },
  });
  assert.equal(res2.status, 409, 'Prevención de solapamiento con código 409 Conflict');
  assert.equal(res2.body.error.code, 'CONCURRENCY_CONFLICT', 'Código CONCURRENCY_CONFLICT devuelto');
  console.log('✅ [PASS]: Persistencia de reservas y prevención de solapamientos con 409 Conflict.');

  // --------------------------------------------------------------------------
  // TEST SUITE 7: INTERNACIONALIZACIÓN (5 MERCADOS) Y HEALTH ENDPOINTS
  // --------------------------------------------------------------------------
  console.log('\n--- 7. Internacionalización en 5 Mercados y Rutas Serverless ---');
  const markets = ['es-CO', 'es-MX', 'en-US', 'pt-BR', 'ja-JP'];
  markets.forEach((m) => {
    assert(m in MARKETS, `Mercado ${m} registrado`);
  });

  assert.equal(jaJP.nav.reservations, '予約管理', 'Traducción japonesa de Reservas');
  assert.equal(enUS.nav.reservations, 'Reservations', 'Traducción inglesa de Reservas');
  assert.equal(ptBR.nav.reservations, 'Reservas', 'Traducción portuguesa de Reservas');
  assert.equal(esCO.reviews.title, 'Opiniones y Reseñas de Clientes', 'Traducción colombiana');
  assert.equal(esMX.reviews.title, 'Opiniones y Reseñas de Clientes', 'Traducción mexicana');

  const authHealth = await requestApp(authApp, 'GET', '/health');
  assert.equal(authHealth.status, 200, 'auth-service UP');
  const restHealth = await requestApp(restaurantApp, 'GET', '/health');
  assert.equal(restHealth.status, 200, 'restaurant-service UP');
  const resHealth = await requestApp(reservationApp, 'GET', '/health');
  assert.equal(resHealth.status, 200, 'reservation-service UP');
  const orderHealth = await requestApp(orderApp, 'GET', '/health');
  assert.equal(orderHealth.status, 200, 'order-service UP');
  const kitchHealth = await requestApp(kitchenApp, 'GET', '/health');
  assert.equal(kitchHealth.status, 200, 'kitchen-service UP');

  console.log('✅ [PASS]: Internacionalización en 5 mercados y funciones serverless validadas al 100%.');

  console.log('\n========================================================================');
  console.log('🎉 TODAS LAS 13 SUITES DE PRUEBAS SERVERLESS PASARON CON 100% DE ÉXITO');
  console.log('========================================================================\n');
}

runServerlessDistributedTests().catch((err) => {
  console.error('Fatal Serverless Test Error:', err);
  process.exit(1);
});
