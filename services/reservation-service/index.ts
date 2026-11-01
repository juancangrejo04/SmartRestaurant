// Reservation Service (Port 4003) - Availability Engine, Concurrency Locking, and Reservation Lifecycle
import express, { Request, Response } from 'express';
import { store } from '../../src/domain/store';

export const reservationApp = express();
reservationApp.use(express.json());

reservationApp.get('/health', (_req: Request, res: Response) => {
  res.json({ service: 'reservation-service', status: 'UP', port: 4003, timestamp: new Date().toISOString() });
});

reservationApp.get('/reservations', (req: Request, res: Response) => {
  const branchId = req.query.branchId as string;
  const date = req.query.date as string;
  const list = store.getReservations(branchId, date);
  res.json({ success: true, data: list });
});

/**
 * Check table availability for a specific time interval
 */
reservationApp.get('/availability', (req: Request, res: Response) => {
  const { tableId, date, startTime, endTime } = req.query;
  if (!tableId || !date || !startTime || !endTime) {
    return res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'Missing parameters' } });
  }

  const isAvailable = store.checkTableAvailability(
    tableId as string,
    date as string,
    startTime as string,
    endTime as string
  );

  res.json({ success: true, isAvailable });
});

/**
 * Create reservation with ACID interval locking & Transactional Outbox event
 */
reservationApp.post('/reservations', (req: Request, res: Response) => {
  try {
    const { tenantId, branchId, tableId, customerName, customerEmail, customerPhone, date, startTime, partySize, specialRequests } = req.body;

    const result = store.createReservation({
      tenantId,
      branchId,
      tableId,
      customerName,
      customerEmail,
      customerPhone,
      date,
      startTime,
      partySize: Number(partySize),
      specialRequests,
    });

    res.status(201).json({
      success: true,
      data: result.reservation,
      outboxEventId: result.outboxEvent.id,
      correlationId: result.reservation.correlationId,
    });
  } catch (err: any) {
    const status = err.statusCode || (err.message.includes('CONCURRENCY') ? 409 : 400);
    res.status(status).json({
      success: false,
      error: {
        code: status === 409 ? 'CONCURRENCY_CONFLICT' : 'RESERVATION_ERROR',
        message: err.message,
      },
    });
  }
});

reservationApp.post('/reservations/:id/cancel', (req: Request, res: Response) => {
  try {
    const cancelled = store.cancelReservation(req.params.id);
    res.json({ success: true, data: cancelled });
  } catch (err: any) {
    res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: err.message } });
  }
});
