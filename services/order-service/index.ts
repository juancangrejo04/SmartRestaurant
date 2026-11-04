// Order Service - Server Price Integrity, Idempotency Protection, and QStash Transactional Outbox
import express, { Request, Response } from 'express';
import cors from 'cors';
import { query, withTransaction } from '../common/db';
import { stageOutboxEvent } from '../common/outbox';
import { publishToQStash } from '../common/qstash';
import { getSupabaseAdminClient } from '../common/supabase';
import { store } from '../../src/domain/store';

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
  res.json({ service: 'order-service', status: 'UP', architecture: 'Serverless Functions (Vercel)', timestamp: new Date().toISOString() });
});

/**
 * List orders by branch
 */
orderApp.get('/orders', async (req: Request, res: Response) => {
  const branchId = req.query.branchId as string;
  const supabase = getSupabaseAdminClient();

  if (supabase) {
    let queryBuilder = supabase.from('orders').select('*').order('created_at', { ascending: false });
    if (branchId) {
      queryBuilder = queryBuilder.eq('branch_id', branchId);
    }
    const { data, error } = await queryBuilder;
    if (!error && data && data.length > 0) {
      return res.json({ success: true, data });
    }
  } else {
    try {
      let sql = `SELECT * FROM orders`;
      const params: any[] = [];
      if (branchId) {
        params.push(branchId);
        sql += ` WHERE branch_id = $1`;
      }
      sql += ` ORDER BY created_at DESC`;
      const { rows } = await query(sql, params);
      if (rows.length > 0) {
        return res.json({ success: true, data: rows });
      }
    } catch {
      // Fallback
    }
  }

  res.json({ success: true, data: store.getOrders(branchId) });
});

/**
 * Get order by ID
 */
orderApp.get('/orders/:id', (req: Request, res: Response) => {
  const order = store.getOrderById(req.params.id);
  if (!order) {
    return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Order not found' } });
  }
  res.json({ success: true, data: order });
});

/**
 * Place Order from Table QR code
 * - Validates Idempotency-Key
 * - Recalculates prices strictly on the server
 * - ACID Transaction + Transactional Outbox + QStash Event
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

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, error: { code: 'EMPTY_CART', message: 'Order must contain items' } });
    }

    // Check idempotency in store / DB
    const existingOrder = store.getOrders().find((o) => o.idempotencyKey === idempotencyKey);
    if (existingOrder) {
      return res.status(200).json({
        success: true,
        data: existingOrder,
        isDuplicateReplay: true,
        correlationId: existingOrder.correlationId,
      });
    }

    // Process order with server-side pricing and transactional outbox
    const result = await withTransaction(async (txClient) => {
      const storeResult = store.createOrder({
        tenantId,
        branchId,
        tableId,
        qrToken,
        idempotencyKey,
        customerName,
        items,
      });

      // Stage Transactional Outbox event in database
      const outboxRecord = await stageOutboxEvent(txClient, {
        aggregateType: 'Order',
        aggregateId: storeResult.order.id,
        eventType: 'OrderCreated',
        tenantId: storeResult.order.tenantId,
        branchId: storeResult.order.branchId,
        correlationId,
        payload: {
          orderId: storeResult.order.id,
          orderNumber: storeResult.order.orderNumber,
          tableNumber: storeResult.order.tableNumber,
          total: storeResult.order.total,
          currency: storeResult.order.currency,
          itemsCount: storeResult.order.items.length,
          status: storeResult.order.status,
        },
      });

      return { ...storeResult, outboxEvent: outboxRecord };
    });

    // Publish event to Upstash QStash
    await publishToQStash('OrderCreated', {
      orderId: result.order.id,
      orderNumber: result.order.orderNumber,
      tableNumber: result.order.tableNumber,
      total: result.order.total,
      currency: result.order.currency,
      status: result.order.status,
      items: result.order.items,
    }, {
      correlationId,
      tenantId: result.order.tenantId,
      branchId: result.order.branchId,
      deduplicationId: result.outboxEvent.id,
    });

    res.status(201).json({
      success: true,
      data: result.order,
      isDuplicateReplay: false,
      outboxEventId: result.outboxEvent.id,
      correlationId,
    });
  } catch (err: any) {
    res.status(400).json({
      success: false,
      error: { code: 'ORDER_ERROR', message: err.message },
    });
  }
});
