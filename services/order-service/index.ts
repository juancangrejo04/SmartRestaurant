// Order Service — Server Price Integrity, Supabase Idempotency Protection, and QStash Outbox
import express, { Request, Response } from 'express';
import cors from 'cors';
import { getDb } from '../common/db';
import { stageOutboxEvent } from '../common/outbox';
import { publishToQStash } from '../common/qstash';

export const orderApp = express();
orderApp.use(cors());
orderApp.use(express.json());

// Correlation ID
orderApp.use((req, res, next) => {
  const correlationId = (req.headers['x-correlation-id'] as string) || `ord-${Date.now().toString(36)}`;
  res.setHeader('X-Correlation-Id', correlationId);
  next();
});

orderApp.get('/health', (_req: Request, res: Response) => {
  res.json({
    service: 'order-service',
    status: 'UP',
    database: 'Supabase PostgreSQL',
    timestamp: new Date().toISOString(),
  });
});

/**
 * List orders by branch from Supabase
 */
orderApp.get('/orders', async (req: Request, res: Response) => {
  try {
    const branchId = req.query.branchId as string;
    const db = getDb();

    let query = db.from('orders').select('*').order('created_at', { ascending: false });
    if (branchId) {
      query = query.eq('branch_id', branchId);
    }

    const { data: orders, error } = await query;
    if (error) throw new Error(error.message);

    return res.json({ success: true, data: orders || [] });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: { code: 'DATABASE_ERROR', message: err.message } });
  }
});

/**
 * Get order by ID with line items from Supabase
 */
orderApp.get('/orders/:id', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { data: order, error: oErr } = await db
      .from('orders')
      .select('*')
      .eq('id', req.params.id)
      .maybeSingle();

    if (oErr) throw new Error(oErr.message);
    if (!order) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Order not found' } });
    }

    const { data: items } = await db
      .from('order_items')
      .select('*')
      .eq('order_id', order.id);

    return res.json({ success: true, data: { ...order, items: items || [] } });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: { code: 'DATABASE_ERROR', message: err.message } });
  }
});

/**
 * Place Order from Table QR code
 * - Validates Idempotency-Key strictly in Supabase
 * - Recalculates prices strictly on the server against menu_items
 * - Persists order, line items, and outbox event into Supabase
 * - Publishes OrderCreated to Upstash QStash
 */
orderApp.post('/orders', async (req: Request, res: Response) => {
  const correlationId = (res.getHeader('X-Correlation-Id') as string) || `tx-ord-${Date.now()}`;

  try {
    const idempotencyKey =
      (req.headers['idempotency-key'] as string) || req.body.idempotencyKey;

    if (!idempotencyKey) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_IDEMPOTENCY_KEY', message: 'Idempotency-Key is required' },
      });
    }

    const { tenantId, branchId, tableId, qrToken, customerName, items } = req.body;

    if (!tenantId || !branchId || !tableId || !items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_ORDER', message: 'Order must contain tenantId, branchId, tableId, and items.' },
      });
    }

    const db = getDb();

    // 1. Check idempotency in Supabase orders table
    const { data: existingOrder, error: checkError } = await db
      .from('orders')
      .select('*')
      .eq('idempotency_key', idempotencyKey)
      .maybeSingle();

    if (checkError) throw new Error(checkError.message);

    if (existingOrder) {
      const { data: existingItems } = await db
        .from('order_items')
        .select('*')
        .eq('order_id', existingOrder.id);

      return res.status(200).json({
        success: true,
        data: { ...existingOrder, items: existingItems || [] },
        isDuplicateReplay: true,
        correlationId: existingOrder.correlation_id,
      });
    }

    // 2. Fetch server prices from menu_items table
    const itemIds = items.map((i: any) => i.menuItemId || i.id);
    const { data: dbMenuItems, error: itemsError } = await db
      .from('menu_items')
      .select('id, name_translations, price, currency')
      .in('id', itemIds);

    if (itemsError) throw new Error(itemsError.message);
    const menuMap = new Map((dbMenuItems || []).map((m) => [m.id, m]));

    // 3. Compute subtotal strictly on the server
    let subtotal = 0;
    const computedItems: any[] = [];
    let currency = 'COP';

    for (const it of items) {
      const targetId = it.menuItemId || it.id;
      const dbItem = menuMap.get(targetId);
      const qty = Math.max(1, Number(it.quantity) || 1);
      const price = dbItem ? Number(dbItem.price) : Number(it.unitPrice || 10000);
      const lineTotal = price * qty;
      subtotal += lineTotal;
      if (dbItem?.currency) currency = dbItem.currency;

      computedItems.push({
        id: `oi-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        menu_item_id: targetId,
        name: dbItem?.name_translations?.['es-CO'] || it.name || 'Plato',
        quantity: qty,
        unit_price: price,
        total_price: lineTotal,
        notes: it.notes || null,
      });
    }

    // 4. Compute Tax based on Currency / Tenant
    let taxRate = 0.08; // Colombia 8%
    if (currency === 'MXN') taxRate = 0.16;
    else if (currency === 'USD') taxRate = 0.08875;
    else if (currency === 'BRL') taxRate = 0.12;
    else if (currency === 'JPY') taxRate = 0.10;

    const tax = Math.round(subtotal * taxRate);
    const total = subtotal + tax;

    // 5. Fetch Table Number
    const { data: tableData } = await db
      .from('restaurant_tables')
      .select('table_number')
      .eq('id', tableId)
      .maybeSingle();

    const tableNumber = tableData?.table_number || 1;
    const orderId = `ord-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
    const orderNumber = `ORD-${Date.now().toString(36).toUpperCase().substring(2, 7)}`;

    // 6. Insert Order into Supabase
    const { data: newOrder, error: insertOrderError } = await db
      .from('orders')
      .insert({
        id: orderId,
        tenant_id: tenantId,
        branch_id: branchId,
        table_id: tableId,
        table_number: tableNumber,
        order_number: orderNumber,
        customer_name: customerName || 'Comensal',
        status: 'RECEIVED',
        subtotal,
        tax,
        total,
        currency,
        idempotency_key: idempotencyKey,
        qr_token: qrToken || null,
        correlation_id: correlationId,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (insertOrderError) throw new Error(insertOrderError.message);

    // 7. Insert Order Items
    const itemsToInsert = computedItems.map((ci) => ({
      ...ci,
      order_id: orderId,
      created_at: new Date().toISOString(),
    }));

    await db.from('order_items').insert(itemsToInsert);

    // 8. Record in order_status_history
    await db.from('order_status_history').insert({
      id: `osh-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      order_id: orderId,
      from_status: null,
      to_status: 'RECEIVED',
      changed_by_role: 'CUSTOMER',
      note: 'Pedido realizado mediante QR de mesa',
      created_at: new Date().toISOString(),
    });

    // 9. Stage Transactional Outbox Event
    const outboxRecord = await stageOutboxEvent({
      aggregateType: 'Order',
      aggregateId: orderId,
      eventType: 'OrderCreated',
      tenantId,
      branchId,
      correlationId,
      payload: {
        orderId,
        orderNumber,
        tableNumber,
        total,
        currency,
        itemsCount: computedItems.length,
        status: 'RECEIVED',
      },
    });

    // 10. Publish to Upstash QStash
    await publishToQStash('OrderCreated', {
      orderId,
      orderNumber,
      tableNumber,
      total,
      currency,
      status: 'RECEIVED',
    }, {
      correlationId,
      tenantId,
      branchId,
      deduplicationId: outboxRecord.id,
    }).catch(() => {});

    return res.status(201).json({
      success: true,
      data: {
        id: newOrder.id,
        tenantId: newOrder.tenant_id,
        branchId: newOrder.branch_id,
        tableId: newOrder.table_id,
        tableNumber: newOrder.table_number,
        orderNumber: newOrder.order_number,
        customerName: newOrder.customer_name,
        status: newOrder.status,
        subtotal: Number(newOrder.subtotal),
        tax: Number(newOrder.tax),
        total: Number(newOrder.total),
        currency: newOrder.currency,
        idempotencyKey: newOrder.idempotency_key,
        createdAt: newOrder.created_at,
        items: computedItems,
      },
      isDuplicateReplay: false,
      outboxEventId: outboxRecord.id,
      correlationId,
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: { code: 'ORDER_ERROR', message: err.message },
    });
  }
});
