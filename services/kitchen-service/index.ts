// Kitchen Service (Port 4005) - Kitchen Display System (KDS) & Order Finite State Machine
import express, { Request, Response } from 'express';
import { store } from '../../src/domain/store';
import { OrderStatus, UserRole } from '../../src/types';

export const kitchenApp = express();
kitchenApp.use(express.json());

kitchenApp.get('/health', (_req: Request, res: Response) => {
  res.json({ service: 'kitchen-service', status: 'UP', port: 4005, timestamp: new Date().toISOString() });
});

kitchenApp.get('/queue', (req: Request, res: Response) => {
  const branchId = req.query.branchId as string;
  const orders = store.getOrders(branchId).filter((o) => o.status !== 'CANCELLED' && o.status !== 'DELIVERED');
  res.json({ success: true, data: orders });
});

/**
 * Advance order status in the finite state machine:
 * RECEIVED -> PREPARING -> READY -> DELIVERED
 */
kitchenApp.patch('/orders/:id/status', (req: Request, res: Response) => {
  try {
    const { status, note } = req.body;
    const userRole = (req.headers['x-user-role'] as UserRole) || 'KITCHEN';

    const result = store.updateOrderStatus(req.params.id, status as OrderStatus, userRole, note);

    res.json({
      success: true,
      data: result.order,
      outboxEventId: result.outboxEvent.id,
      correlationId: result.order.correlationId,
    });
  } catch (err: any) {
    res.status(400).json({
      success: false,
      error: { code: 'INVALID_TRANSITION', message: err.message },
    });
  }
});
