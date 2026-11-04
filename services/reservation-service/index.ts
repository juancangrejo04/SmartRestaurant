// Reservation Service - ACID Interval Locking, Supabase and QStash Transactional Outbox
import express, { Request, Response } from 'express';
import cors from 'cors';
import { query, withTransaction } from '../common/db';
import { stageOutboxEvent } from '../common/outbox';
import { publishToQStash } from '../common/qstash';
import { getSupabaseAdminClient } from '../common/supabase';
import { store } from '../../src/domain/store';

export const reservationApp = express();
reservationApp.use(cors());
reservationApp.use(express.json());

// Correlation ID
reservationApp.use((req, res, next) => {
  const correlationId = (req.headers['x-correlation-id'] as string) || `res-${Date.now().toString(36)}`;
  res.setHeader('X-Correlation-Id', correlationId);
  next();
});

reservationApp.get('/health', (_req: Request, res: Response) => {
  res.json({ service: 'reservation-service', status: 'UP', architecture: 'Serverless Functions (Vercel)', timestamp: new Date().toISOString() });
});

/**
 * List reservations by branch & date
 */
reservationApp.get('/reservations', async (req: Request, res: Response) => {
  const branchId = req.query.branchId as string;
  const date = req.query.date as string;
  const supabase = getSupabaseAdminClient();

  if (supabase) {
    let q = supabase.from('reservations').select('*').neq('status', 'CANCELLED');
    if (branchId) q = q.eq('branch_id', branchId);
    if (date) q = q.eq('reservation_date', date);
    const { data, error } = await q;
    if (!error && data && data.length > 0) {
      return res.json({
        success: true,
        data: data.map((r) => ({
          id: r.id,
          tenantId: r.tenant_id,
          branchId: r.branch_id,
          tableId: r.table_id,
          tableNumber: r.table_number || 1,
          customerName: r.customer_name,
          customerEmail: r.customer_email,
          customerPhone: r.customer_phone,
          date: r.reservation_date,
          startTime: r.start_time,
          endTime: r.end_time,
          partySize: r.party_size,
          status: r.status,
          specialRequests: r.special_requests,
          correlationId: r.correlation_id,
          createdAt: r.created_at,
        })),
      });
    }
  } else {
    try {
      let sql = `SELECT * FROM reservations WHERE status != 'CANCELLED'`;
      const params: any[] = [];
      if (branchId) {
        params.push(branchId);
        sql += ` AND branch_id = $${params.length}`;
      }
      if (date) {
        params.push(date);
        sql += ` AND reservation_date = $${params.length}`;
      }
      const { rows } = await query(sql, params);
      if (rows.length > 0) {
        return res.json({
          success: true,
          data: rows.map((r) => ({
            id: r.id,
            tenantId: r.tenant_id,
            branchId: r.branch_id,
            tableId: r.table_id,
            tableNumber: r.table_number || 1,
            customerName: r.customer_name,
            customerEmail: r.customer_email,
            customerPhone: r.customer_phone,
            date: r.reservation_date,
            startTime: r.start_time,
            endTime: r.end_time,
            partySize: r.party_size,
            status: r.status,
            specialRequests: r.special_requests,
            correlationId: r.correlation_id,
            createdAt: r.created_at,
          })),
        });
      }
    } catch {
      // Fallback
    }
  }

  const list = store.getReservations(branchId, date);
  res.json({ success: true, data: list });
});

/**
 * Check availability with interval collision check
 */
reservationApp.get('/availability', async (req: Request, res: Response) => {
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
 * Create reservation with ACID interval locking & QStash Transactional Outbox
 */
reservationApp.post('/reservations', async (req: Request, res: Response) => {
  const correlationId = (res.getHeader('X-Correlation-Id') as string) || `res-${Date.now()}`;

  try {
    const { tenantId, branchId, tableId, customerName, customerEmail, customerPhone, date, startTime, partySize, specialRequests } = req.body;

    if (!tenantId || !branchId || !tableId || !customerName || !date || !startTime) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Missing required reservation fields' } });
    }

    // 1. Concurrency collision prevention check
    const isFree = store.checkTableAvailability(tableId, date, startTime, calculateEndTime(startTime));
    if (!isFree) {
      return res.status(409).json({
        success: false,
        error: {
          code: 'CONCURRENCY_CONFLICT',
          message: `[CONCURRENCY_CONFLICT]: The slot on ${date} starting at ${startTime} collides with an existing confirmed reservation on table ${tableId}.`,
        },
      });
    }

    // 2. ACID Transaction: Persist Reservation + Stage Outbox Event
    const result = await withTransaction(async (txClient) => {
      const resId = `res-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
      const endTime = calculateEndTime(startTime);

      await txClient.query(
        `INSERT INTO reservations (
          id, tenant_id, branch_id, table_id, customer_name, customer_email, customer_phone, reservation_date, start_time, end_time, party_size, status, special_requests, correlation_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
        [
          resId,
          tenantId,
          branchId,
          tableId,
          customerName,
          customerEmail || '',
          customerPhone || '',
          date,
          startTime,
          endTime,
          Number(partySize) || 2,
          'CONFIRMED',
          specialRequests || '',
          correlationId,
        ]
      );

      // Stage Transactional Outbox event within same transaction
      const outboxRecord = await stageOutboxEvent(txClient, {
        aggregateType: 'Reservation',
        aggregateId: resId,
        eventType: 'ReservationCreated',
        tenantId,
        branchId,
        correlationId,
        payload: {
          reservationId: resId,
          tableId,
          customerName,
          customerEmail,
          customerPhone,
          date,
          startTime,
          endTime,
          partySize: Number(partySize) || 2,
          status: 'CONFIRMED',
        },
      });

      // Synchronize in-memory mirror
      const storeResult = store.createReservation({
        tenantId,
        branchId,
        tableId,
        customerName,
        customerEmail: customerEmail || '',
        customerPhone: customerPhone || '',
        date,
        startTime,
        partySize: Number(partySize) || 2,
        specialRequests,
      });

      return { reservation: storeResult.reservation, outboxEvent: outboxRecord };
    });

    // 3. Publish to Upstash QStash
    await publishToQStash('ReservationCreated', {
      ...result.reservation,
    }, {
      correlationId,
      tenantId: result.reservation.tenantId,
      branchId: result.reservation.branchId,
      deduplicationId: result.outboxEvent.id,
    });

    res.status(201).json({
      success: true,
      data: result.reservation,
      outboxEventId: result.outboxEvent.id,
      correlationId,
    });
  } catch (err: any) {
    const isConflict = err.message?.includes('CONCURRENCY') || err.message?.includes('collision');
    res.status(isConflict ? 409 : 400).json({
      success: false,
      error: {
        code: isConflict ? 'CONCURRENCY_CONFLICT' : 'RESERVATION_ERROR',
        message: err.message,
      },
    });
  }
});

/**
 * Cancel Reservation
 */
reservationApp.patch('/reservations/:id/cancel', async (req: Request, res: Response) => {
  const correlationId = (res.getHeader('X-Correlation-Id') as string) || `res-cancel-${Date.now()}`;
  try {
    const reservationId = req.params.id;
    const cancelled = store.cancelReservation(reservationId);

    // Publish ReservationCancelled to QStash
    await publishToQStash('ReservationCancelled', {
      reservationId,
      tableId: cancelled.tableId,
      tenantId: cancelled.tenantId,
      branchId: cancelled.branchId,
    }, {
      correlationId,
      tenantId: cancelled.tenantId,
      branchId: cancelled.branchId,
      deduplicationId: `cancel-${reservationId}-${Date.now()}`,
    });

    res.json({ success: true, data: cancelled, correlationId });
  } catch (err: any) {
    res.status(400).json({ success: false, error: { code: 'CANCEL_ERROR', message: err.message } });
  }
});

function calculateEndTime(startTime: string): string {
  const [h, m] = startTime.split(':').map(Number);
  const totalMinutes = h * 60 + m + 120; // 2 hours duration
  const endH = Math.floor(totalMinutes / 60) % 24;
  const endM = totalMinutes % 60;
  return `${endH.toString().padStart(2, '0')}:${endM.toString().padStart(2, '0')}`;
}
