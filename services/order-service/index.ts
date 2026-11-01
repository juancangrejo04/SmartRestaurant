// Order Service (Port 4004) - QR Ordering, Server Price Integrity, and Idempotency Protection
import express, { Request, Response } from 'express';
import { store } from '../../src/domain/store';

export const orderApp = express();
orderApp.use(express.json());

orderApp.get('/health', (_req: Request, res: Response) => {
  res.json({ service: 'order-service', status: 'UP', port: 4004, timestamp: new Date().toISOString() });
});

orderApp.get('/orders', (req: Request, res: Response) => {
  const branchId = req.query.branchId as string;
  const list = store.getOrders(branchId);
  res.json({ success: true, data: list });
});

orderApp.get('/orders/:id', (req: Request, res: Response) => {
  const order = store.getOrderById(req.params.id);
  if (!order) {
    return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Order not found' } });
  }
  res.json({ success: true, data: order });
});

/**
 * Place Order from Table QR code
 * Validates Idempotency-Key and recalculates prices strictly on the server
 */
orderApp.post('/orders', (req: Request, res: Response) => {
  try {
    const idempotencyKey =
      (req.headers['idempotency-key'] as string) || req.body.idempotencyKey;

    if (!idempotencyKey) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_IDEMPOTENCY_KEY', message: 'Idempotency key is required' },
      });
    }

    const { tenantId, branchId, tableId, qrToken, customerName, items } = req.body;

    const result = store.createOrder({
      tenantId,
      branchId,
      tableId,
      qrToken,
      idempotencyKey,
      customerName,
      items,
    });

    const statusCode = result.isDuplicate ? 200 : 201;

    res.status(statusCode).json({
      success: true,
      data: result.order,
      isDuplicateReplay: result.isDuplicate,
      correlationId: result.order.correlationId,
    });
  } catch (err: any) {
    res.status(400).json({
      success: false,
      error: { code: 'ORDER_CREATION_FAILED', message: err.message },
    });
  }
});
