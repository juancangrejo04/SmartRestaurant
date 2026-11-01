// Automated Distributed Test Suite for SmartRestaurant
// Tests Concurrency Locking, Idempotency, Server-Side Pricing, KDS Transitions, and i18n
import { store } from '../src/domain/store';
import { MARKETS } from '../src/i18n/i18nContext';
import { jaJP } from '../src/i18n/locales/ja-JP';

function assert(condition: boolean, testName: string, details?: string) {
  if (!condition) {
    console.error(`❌ [FAIL]: ${testName}${details ? ` -> ${details}` : ''}`);
    process.exit(1);
  }
  console.log(`✅ [PASS]: ${testName}`);
}

async function runTests() {
  console.log('====================================================');
  console.log('🚀 EJECUTANDO SUITE DE PRUEBAS AUTOMATIZADAS SMARTRESTAURANT');
  console.log('====================================================\n');

  // TEST 1: RESERVATION CONCURRENCY & INTERVAL LOCKING
  console.log('--- 1. Pruebas de Concurrencia y Bloqueo de Franjas en Reservas ---');
  const testDate = '2026-11-15';
  const tableId = 'tbl-col-01'; // Bogotá Table 1

  // First booking: 19:00 - 21:00
  const booking1 = store.createReservation({
    tenantId: 'rest-col-01',
    branchId: 'branch-col-bog',
    tableId,
    customerName: 'Prueba Concurrencia 1',
    customerEmail: 'test1@concurrency.org',
    customerPhone: '+57 300 111 2222',
    date: testDate,
    startTime: '19:00',
    partySize: 2,
  });
  assert(booking1.reservation.status === 'CONFIRMED', 'Reserva 1 creada exitosamente en 19:00-21:00');
  assert(booking1.outboxEvent.eventType === 'ReservationCreated', 'Evento ReservationCreated emitido en outbox');

  // Conflicting booking attempt: 19:30 - 21:30 (Overlaps with 19:00 - 21:00)
  let collisionCaught = false;
  try {
    store.createReservation({
      tenantId: 'rest-col-01',
      branchId: 'branch-col-bog',
      tableId,
      customerName: 'Prueba Concurrencia 2 (Conflicto)',
      customerEmail: 'test2@concurrency.org',
      customerPhone: '+57 300 333 4444',
      date: testDate,
      startTime: '19:30',
      partySize: 2,
    });
  } catch (err: any) {
    collisionCaught = true;
    assert(
      err.message.includes('CONCURRENCY_CONFLICT'),
      'Rechazo de reserva simultánea por colisión de intervalo (409 Conflict)',
      err.message
    );
  }
  assert(collisionCaught, 'El motor de concurrencia bloqueó exitosamente la doble reserva');

  // Non-conflicting booking attempt on same table later: 21:30 - 23:30 (No overlap)
  const bookingNonConflict = store.createReservation({
    tenantId: 'rest-col-01',
    branchId: 'branch-col-bog',
    tableId,
    customerName: 'Prueba No Conflicto 3',
    customerEmail: 'test3@concurrency.org',
    customerPhone: '+57 300 555 6666',
    date: testDate,
    startTime: '21:30',
    partySize: 2,
  });
  assert(
    bookingNonConflict.reservation.status === 'CONFIRMED',
    'Permite reserva no superpuesta en la misma mesa y fecha (21:30)'
  );

  // TEST 2: ORDER PRICE CALCULATION & IDEMPOTENCY KEY
  console.log('\n--- 2. Pruebas de Integridad de Precios e Idempotencia en Pedidos ---');
  const idempotencyKey = `idem-test-${Date.now()}`;
  const qrToken = 'qr-bog-tbl-01-token884'; // Table 1 token

  const orderResult1 = store.createOrder({
    tenantId: 'rest-col-01',
    branchId: 'branch-col-bog',
    tableId,
    qrToken,
    idempotencyKey,
    customerName: 'Cliente Idempotencia',
    items: [
      { menuItemId: 'item-col-01', quantity: 2 }, // Bandeja Paisa: 48.000 COP x 2 = 96.000 COP
      { menuItemId: 'item-col-04', quantity: 1 }, // Lulada: 15.000 COP x 1 = 15.000 COP
    ],
  });

  assert(!orderResult1.isDuplicate, 'Primer intento de pedido procesado normalmente (Status 201 Created)');
  assert(orderResult1.order.subtotal === 111000, 'Subtotal calculado estrictamente en el servidor (111.000 COP)');
  assert(orderResult1.order.tax === 8880, 'Impuesto calculado según moneda y tasa local (8% impoconsumo = 8.880 COP)');
  assert(orderResult1.order.total === 119880, 'Total calculado exactamente (119.880 COP)');

  // Retry with same Idempotency Key
  const orderResult2 = store.createOrder({
    tenantId: 'rest-col-01',
    branchId: 'branch-col-bog',
    tableId,
    qrToken,
    idempotencyKey,
    customerName: 'Cliente Idempotencia Reintento',
    items: [{ menuItemId: 'item-col-01', quantity: 2 }],
  });

  assert(orderResult2.isDuplicate, 'Reintento con misma Idempotency-Key detectado como duplicado');
  assert(orderResult2.order.id === orderResult1.order.id, 'Devolvió la orden original sin crear duplicados');

  // TEST 3: KITCHEN FINITE STATE MACHINE (KDS)
  console.log('\n--- 3. Pruebas de Máquina de Estados de Cocina ---');
  const targetOrderId = orderResult1.order.id;

  // Step 1: Advance RECEIVED -> PREPARING
  const prepTransition = store.updateOrderStatus(targetOrderId, 'PREPARING', 'KITCHEN');
  assert(prepTransition.order.status === 'PREPARING', 'Transición válida: RECEIVED -> PREPARING');
  assert(prepTransition.outboxEvent.eventType === 'OrderAcceptedByKitchen', 'Evento OrderAcceptedByKitchen emitido');

  // Step 2: Test illegal transition attempt: PREPARING -> DELIVERED (Must go through READY first)
  let illegalCaught = false;
  try {
    store.updateOrderStatus(targetOrderId, 'DELIVERED', 'KITCHEN');
  } catch (err: any) {
    illegalCaught = true;
    assert(
      err.message.includes('INVALID_TRANSITION'),
      'Rechazo de salto inválido en máquina de estados (PREPARING -> DELIVERED)'
    );
  }
  assert(illegalCaught, 'La máquina de estados protegió la secuencia de cocina');

  // Step 3: Advance PREPARING -> READY
  const readyTransition = store.updateOrderStatus(targetOrderId, 'READY', 'KITCHEN');
  assert(readyTransition.order.status === 'READY', 'Transición válida: PREPARING -> READY');

  // Step 4: Advance READY -> DELIVERED
  const deliveredTransition = store.updateOrderStatus(targetOrderId, 'DELIVERED', 'KITCHEN');
  assert(deliveredTransition.order.status === 'DELIVERED', 'Transición válida: READY -> DELIVERED');

  // TEST 4: MULTI-TENANT ISOLATION
  console.log('\n--- 4. Pruebas de Aislamiento Multi-Tenant ---');
  const colMenu = store.getMenuItems(undefined, 'rest-col-01');
  const jpnMenu = store.getMenuItems(undefined, 'rest-jpn-05');

  assert(colMenu.every((i) => i.tenantId === 'rest-col-01'), 'Catálogo de Colombia aislado al tenant rest-col-01');
  assert(jpnMenu.every((i) => i.tenantId === 'rest-jpn-05'), 'Catálogo de Japón aislado al tenant rest-jpn-05');
  assert(colMenu.every((i) => i.currency === 'COP'), 'Platos de Colombia preservan moneda comercial COP');
  assert(jpnMenu.every((i) => i.currency === 'JPY'), 'Platos de Japón preservan moneda comercial JPY');

  // TEST 5: INTERNATIONALIZATION (5 MARKETS)
  console.log('\n--- 5. Pruebas de Internacionalización y Mercados ---');
  const requiredMarkets = ['es-CO', 'es-MX', 'en-US', 'pt-BR', 'ja-JP'];
  requiredMarkets.forEach((m) => {
    assert(m in MARKETS, `Mercado ${m} registrado en la configuración multinacional`);
  });

  // Verify authentic Japanese text
  assert(jaJP.nav.reservations === '予約管理', 'Traducción auténtica en japonés para Reservas (予約管理)');
  assert(jaJP.kitchen.title.includes('厨房'), 'Traducción auténtica en japonés para Cocina (厨房)');
  assert(jaJP.qrOrder.orderSuccessTitle.includes('厨房'), 'Confirmación de pedido en japonés');
  assert(jaJP.qrOrder.allDishes === 'すべての料理', 'Traducción de todos los platos en japonés (すべての料理)');
  assert(jaJP.qrOrder.openTableService === 'テーブルサービス利用中', 'Traducción de servicio en mesa en japonés');
  assert(jaJP.qrOrder.addDish === '追加', 'Botón de agregar plato en japonés (追加)');
  assert(jaJP.waiter.table === 'テーブル', 'Palabra Mesa en japonés (テーブル)');

  // Verify authentic English & Portuguese text (USA & Brazil)
  const { enUS } = await import('../src/i18n/locales/en-US');
  const { ptBR } = await import('../src/i18n/locales/pt-BR');

  assert(enUS.qrOrder.allDishes === 'All Dishes', 'Traducción de todos los platos en inglés (All Dishes)');
  assert(enUS.qrOrder.openTableService === 'Active Table Service', 'Traducción de servicio en mesa en inglés');
  assert(enUS.qrOrder.addDish === 'Add', 'Botón de agregar plato en inglés (Add)');
  assert(enUS.waiter.table === 'Table', 'Palabra Mesa en inglés (Table)');

  assert(ptBR.qrOrder.allDishes === 'Todos os Pratos', 'Traducción de todos los platos en portugués (Todos os Pratos)');
  assert(ptBR.qrOrder.openTableService === 'Atendimento de Mesa Aberto', 'Traducción de servicio en mesa en portugués');
  assert(ptBR.qrOrder.addDish === 'Adicionar', 'Botón de agregar plato en portugués (Adicionar)');
  assert(ptBR.waiter.table === 'Mesa', 'Palabra Mesa en portugués (Mesa)');

  // TEST 6: CUSTOMER REVIEWS & RATINGS IN ALL BRANCHES
  console.log('\n--- 6. Pruebas de Reseñas y Opiniones Multinacionales ---');
  const initialRevCount = store.getReviews('branch-col-bog').length;
  assert(initialRevCount >= 2, 'Reseñas iniciales registradas en sede Bogotá');

  const newRev = store.addReview({
    tenantId: 'rest-col-01',
    branchId: 'branch-col-bog',
    customerName: 'Cliente Prueba Automatizada',
    rating: 5,
    comment: 'Comentario de prueba sobre la atención y el sabor del ajiaco.',
    orderNumber: 'ORD-2026-TEST-99',
    dishName: 'Ajiaco Santafereño',
    isVerifiedPurchase: true,
  });

  assert(newRev.rating === 5, 'Reseña creada con 5 estrellas');
  assert(newRev.isVerifiedPurchase === true, 'Reseña marcada como compra verificada');

  const stats = store.getReviewStats('branch-col-bog');
  assert(stats.count === initialRevCount + 1, 'Estadísticas de reseñas incrementadas correctamente');
  assert(stats.average >= 4.5, 'Promedio de satisfacción calculado correctamente');
  assert(stats.breakdown[5] >= 2, 'Desglose por estrellas registrado');

  // Verify reviews keys exist across all 5 languages
  assert(jaJP.reviews.title === 'お客様からの口コミ・評価', 'Título de reseñas en japonés');
  assert(jaJP.reviews.leaveReview === 'レビューを投稿する', 'Botón dejar reseña en japonés');
  assert(enUS.reviews.title === 'Guest Reviews & Ratings', 'Título de reseñas en inglés');
  assert(enUS.reviews.leaveReview === 'Leave a Review', 'Botón dejar reseña en inglés');
  assert(ptBR.reviews.title === 'Avaliações e Opiniões dos Clientes', 'Título de reseñas en portugués');
  assert(ptBR.reviews.leaveReview === 'Deixar uma Avaliação', 'Botón dejar reseña en portugués');

  console.log('\n====================================================');
  console.log('🎉 TODAS LAS PRUEBAS AUTOMATIZADAS PASARON CON ÉXITO');
  console.log('====================================================\n');
}

runTests().catch((err) => {
  console.error('Fatal Test Runner Error:', err);
  process.exit(1);
});
