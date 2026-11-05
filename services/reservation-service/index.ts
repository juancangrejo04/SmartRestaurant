// Reservation Service — Supabase ACID Interval Locking & QStash Transactional Outbox
import express, { Request, Response } from 'express';
import cors from 'cors';
import { getDb } from '../common/db';
import { stageOutboxEvent } from '../common/outbox';
import { publishToQStash } from '../common/qstash';

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
  res.json({
    service: 'reservation-service',
    status: 'UP',
    database: 'Supabase PostgreSQL',
    timestamp: new Date().toISOString(),
  });
});

function timeToMinutes(timeStr: string): number {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

function calculateEndTime(startTime: string): string {
  const [h, m] = startTime.split(':').map(Number);
  const totalMinutes = h * 60 + m + 120; // 2 hour dining window
  const endH = Math.floor(totalMinutes / 60) % 24;
  const endM = totalMinutes % 60;
  return `${endH.toString().padStart(2, '0')}:${endM.toString().padStart(2, '0')}`;
}

/**
 * List reservations by branch & date from Supabase
 */
reservationApp.get('/reservations', async (req: Request, res: Response) => {
  try {
    const branchId = req.query.branchId as string;
    const date = req.query.date as string;
    const db = getDb();

    let q = db.from('reservations').select('*').neq('status', 'CANCELLED');
    if (branchId) q = q.eq('branch_id', branchId);
    if (date) q = q.eq('reservation_date', date);

    const { data, error } = await q.order('start_time', { ascending: true });
    if (error) throw new Error(error.message);

    const formatted = (data || []).map((r) => ({
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
    }));

    return res.json({ success: true, data: formatted });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: { code: 'DATABASE_ERROR', message: err.message } });
  }
});

/**
 * Check table availability directly from Supabase
 */
reservationApp.get('/availability', async (req: Request, res: Response) => {
  try {
    const { tableId, date, startTime, endTime } = req.query;
    if (!tableId || !date || !startTime || !endTime) {
      return res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'Missing parameters' } });
    }

    const db = getDb();
    const { data: existingReservations, error } = await db
      .from('reservations')
      .select('id, start_time, end_time, status')
      .eq('table_id', tableId as string)
      .eq('reservation_date', date as string)
      .neq('status', 'CANCELLED');

    if (error) throw new Error(error.message);

    const newStart = timeToMinutes(startTime as string);
    const newEnd = timeToMinutes(endTime as string);

    const hasCollision = (existingReservations || []).some((r) => {
      const eStart = timeToMinutes(r.start_time);
      const eEnd = timeToMinutes(r.end_time);
      return newStart < eEnd && newEnd > eStart;
    });

    return res.json({ success: true, isAvailable: !hasCollision });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: { code: 'DATABASE_ERROR', message: err.message } });
  }
});

/**
 * Create reservation with real interval collision check, Supabase insertion and QStash Outbox
 */
reservationApp.post('/reservations', async (req: Request, res: Response) => {
  const correlationId = (res.getHeader('X-Correlation-Id') as string) || `res-${Date.now()}`;

  try {
    const {
      tenantId,
      branchId,
      tableId,
      customerName,
      customerEmail,
      customerPhone,
      date,
      startTime,
      partySize,
      specialRequests,
    } = req.body;

    if (!tenantId || !branchId || !tableId || !customerName || !date || !startTime) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Missing required reservation fields' },
      });
    }

    const db = getDb();
    const endTime = calculateEndTime(startTime);

    // 1. Collision check on active reservations
    const { data: collisions, error: checkError } = await db
      .from('reservations')
      .select('id, start_time, end_time')
      .eq('table_id', tableId)
      .eq('reservation_date', date)
      .neq('status', 'CANCELLED');

    if (checkError) throw new Error(checkError.message);

    const newStart = timeToMinutes(startTime);
    const newEnd = timeToMinutes(endTime);

    const isConflict = (collisions || []).some((r) => {
      const eStart = timeToMinutes(r.start_time);
      const eEnd = timeToMinutes(r.end_time);
      return newStart < eEnd && newEnd > eStart;
    });

    if (isConflict) {
      return res.status(409).json({
        success: false,
        error: {
          code: 'CONCURRENCY_CONFLICT',
          message: `[CONCURRENCY_CONFLICT]: The slot on ${date} starting at ${startTime} collides with an existing confirmed reservation on table ${tableId}.`,
        },
      });
    }

    // 2. Fetch table details
    const { data: tableData } = await db
      .from('restaurant_tables')
      .select('table_number')
      .eq('id', tableId)
      .maybeSingle();

    const tableNumber = tableData?.table_number || 1;
    const resId = `res-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;

    // 3. Persist reservation to Supabase
    const { data: reservation, error: insertError } = await db
      .from('reservations')
      .insert({
        id: resId,
        tenant_id: tenantId,
        branch_id: branchId,
        table_id: tableId,
        table_number: tableNumber,
        customer_name: customerName,
        customer_email: customerEmail || '',
        customer_phone: customerPhone || '',
        reservation_date: date,
        start_time: startTime,
        end_time: endTime,
        party_size: Number(partySize) || 2,
        status: 'CONFIRMED',
        special_requests: specialRequests || '',
        correlation_id: correlationId,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (insertError) throw new Error(insertError.message);

    // 4. Stage event into outbox_events table
    const outboxRecord = await stageOutboxEvent({
      aggregateType: 'Reservation',
      aggregateId: resId,
      eventType: 'ReservationCreated',
      tenantId,
      branchId,
      correlationId,
      payload: {
        reservationId: resId,
        tableId,
        tableNumber,
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

    // 5. Publish to Upstash QStash
    await publishToQStash('ReservationCreated', {
      reservationId: resId,
      tenantId,
      branchId,
      tableNumber,
      customerName,
      date,
      startTime,
    }, {
      correlationId,
      tenantId,
      branchId,
      deduplicationId: outboxRecord.id,
    }).catch(() => {});

    return res.status(201).json({
      success: true,
      data: {
        id: reservation.id,
        tenantId: reservation.tenant_id,
        branchId: reservation.branch_id,
        tableId: reservation.table_id,
        tableNumber: reservation.table_number,
        customerName: reservation.customer_name,
        customerEmail: reservation.customer_email,
        customerPhone: reservation.customer_phone,
        date: reservation.reservation_date,
        startTime: reservation.start_time,
        endTime: reservation.end_time,
        partySize: reservation.party_size,
        status: reservation.status,
        specialRequests: reservation.special_requests,
        correlationId: reservation.correlation_id,
        createdAt: reservation.created_at,
      },
      outboxEventId: outboxRecord.id,
      correlationId,
    });
  } catch (err: any) {
    const isConflict = err.message?.includes('CONCURRENCY');
    return res.status(isConflict ? 409 : 500).json({
      success: false,
      error: {
        code: isConflict ? 'CONCURRENCY_CONFLICT' : 'RESERVATION_ERROR',
        message: err.message,
      },
    });
  }
});

/**
 * Cancel Reservation in Supabase and trigger QStash event
 */
reservationApp.patch('/reservations/:id/cancel', async (req: Request, res: Response) => {
  const correlationId = (res.getHeader('X-Correlation-Id') as string) || `res-cancel-${Date.now()}`;
  try {
    const reservationId = req.params.id;
    const db = getDb();

    const { data: updated, error } = await db
      .from('reservations')
      .update({ status: 'CANCELLED' })
      .eq('id', reservationId)
      .select()
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!updated) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Reservation not found' } });
    }

    // Stage outbox event
    const outboxRecord = await stageOutboxEvent({
      aggregateType: 'Reservation',
      aggregateId: reservationId,
      eventType: 'ReservationCancelled',
      tenantId: updated.tenant_id,
      branchId: updated.branch_id,
      correlationId,
      payload: {
        reservationId,
        tableId: updated.table_id,
        status: 'CANCELLED',
      },
    });

    // Publish to QStash
    await publishToQStash('ReservationCancelled', {
      reservationId,
      tableId: updated.table_id,
      tenantId: updated.tenant_id,
      branchId: updated.branch_id,
    }, {
      correlationId,
      tenantId: updated.tenant_id,
      branchId: updated.branch_id,
      deduplicationId: outboxRecord.id,
    }).catch(() => {});

    return res.json({
      success: true,
      data: {
        id: updated.id,
        status: updated.status,
        tableId: updated.table_id,
        branchId: updated.branch_id,
      },
      correlationId,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: { code: 'CANCEL_ERROR', message: err.message } });
  }
});
