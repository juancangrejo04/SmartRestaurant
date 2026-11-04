// Kitchen Service - Kitchen Display System (KDS), State Machine, and QStash Event Integration
import express, { Request, Response } from 'express';
import cors from 'cors';
import { withTransaction } from '../common/db';
import { stageOutboxEvent } from '../common/outbox';
import { publishToQStash } from '../common/qstash';
import { store } from '../../src/domain/store';
import { OrderStatus, UserRole } from '../../src/types';

export const kitchenApp = express();
kitchenApp.use(cors());
kitchenApp.use(express.json());

// Correlation ID
kitchenApp.use((req, res, next) => {
  const correlationId = (req.headers['x-correlation-id'] as string) || `kitch-${Date.now().toString(36)}`;
  res.setHeader('X-Correlation-Id', correlationId);
  next();
});

kitchenApp.get('/health', (_req: Request, res: Response) => {
  res.json({ service: 'kitchen-service', status: 'UP', architecture: 'Serverless Functions (Vercel)', timestamp: new Date().toISOString() });
});

/**
 * Get active kitchen queue
 */
kitchenApp.get('/queue', (req: Request, res: Response) => {
  const branchId = req.query.branchId as string;
  const orders = store.getOrders(branchId).filter((o) => o.status !== 'CANCELLED' && o.status !== 'DELIVERED');
  res.json({ success: true, data: orders });
});

/**
 * Advance order in the Finite State Machine:
 * RECEIVED -> PREPARING -> READY -> DELIVERED
 */
kitchenApp.patch('/orders/:id/status', async (req: Request, res: Response) => {
  const correlationId = (res.getHeader('X-Correlation-Id') as string) || `kds-${Date.now()}`;

  try {
    const { status, note } = req.body;
    const userRole = (req.headers['x-user-role'] as UserRole) || 'KITCHEN';

    const result = await withTransaction(async (txClient) => {
      // 1. Advance in store state machine
      const storeResult = store.updateOrderStatus(req.params.id, status as OrderStatus, userRole, note);

      // 2. Map to standard QStash event types
      const eventType =
        status === 'PREPARING'
          ? 'KitchenOrderAccepted'
          : status === 'READY'
          ? 'KitchenOrderCompleted'
          : 'OrderUpdated';

      const outboxRecord = await stageOutboxEvent(txClient, {
        aggregateType: 'Kitchen',
        aggregateId: storeResult.order.id,
        eventType: eventType as any,
        tenantId: storeResult.order.tenantId,
        branchId: storeResult.order.branchId,
        correlationId,
        payload: {
          orderId: storeResult.order.id,
          orderNumber: storeResult.order.orderNumber,
          tableNumber: storeResult.order.tableNumber,
          status,
          updatedByRole: userRole,
          note,
        },
      });

      return { ...storeResult, outboxEvent: outboxRecord };
    });

    // Publish to Upstash QStash
    const qstashEventType =
      status === 'PREPARING'
        ? 'KitchenOrderAccepted'
        : status === 'READY'
        ? 'KitchenOrderCompleted'
        : 'OrderUpdated';

    await publishToQStash(qstashEventType, {
      orderId: result.order.id,
      orderNumber: result.order.orderNumber,
      status: result.order.status,
      tableNumber: result.order.tableNumber,
      updatedByRole: userRole,
    }, {
      correlationId,
      tenantId: result.order.tenantId,
      branchId: result.order.branchId,
      deduplicationId: result.outboxEvent.id,
    });

    res.json({
      success: true,
      data: result.order,
      outboxEventId: result.outboxEvent.id,
      correlationId,
    });
  } catch (err: any) {
    res.status(400).json({
      success: false,
      error: { code: 'INVALID_TRANSITION', message: err.message },
    });
  }
});
