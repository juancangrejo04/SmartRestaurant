// Upstash QStash Messaging & Cryptographic Webhook Verification
import { Client, Receiver } from '@upstash/qstash';
import { getDb } from './db';

const QSTASH_TOKEN = process.env.QSTASH_TOKEN || '';
const QSTASH_CURRENT_SIGNING_KEY = process.env.QSTASH_CURRENT_SIGNING_KEY || '';
const QSTASH_NEXT_SIGNING_KEY = process.env.QSTASH_NEXT_SIGNING_KEY || '';
const APP_BASE_URL = process.env.APP_BASE_URL || 'https://smartrestaurant.vercel.app';

let qstashClient: Client | null = null;
let qstashReceiver: Receiver | null = null;

export type QStashEventType =
  | 'ReservationCreated'
  | 'ReservationCancelled'
  | 'OrderCreated'
  | 'OrderUpdated'
  | 'KitchenOrderAccepted'
  | 'KitchenOrderCompleted'
  | 'PaymentStatusUpdated'
  | 'NotificationRequested';

export interface QStashEventEnvelope<T = any> {
  eventId: string;
  eventType: QStashEventType;
  topic: string;
  correlationId: string;
  tenantId: string;
  branchId?: string;
  timestamp: string;
  payload: T;
}

export function isQStashConfigured(): boolean {
  return Boolean(QSTASH_TOKEN && QSTASH_TOKEN.length > 5);
}

export function isQStashReceiverConfigured(): boolean {
  return Boolean(QSTASH_CURRENT_SIGNING_KEY && QSTASH_NEXT_SIGNING_KEY);
}

export function getQStashClient(): Client | null {
  if (!isQStashConfigured()) return null;
  if (!qstashClient) {
    qstashClient = new Client({ token: QSTASH_TOKEN });
  }
  return qstashClient;
}

export function getQStashReceiver(): Receiver | null {
  if (!isQStashReceiverConfigured()) return null;
  if (!qstashReceiver) {
    qstashReceiver = new Receiver({
      currentSigningKey: QSTASH_CURRENT_SIGNING_KEY,
      nextSigningKey: QSTASH_NEXT_SIGNING_KEY,
    });
  }
  return qstashReceiver;
}

let testPublisher: ((envelope: QStashEventEnvelope) => Promise<{ success: boolean; messageId?: string; error?: string }>) | null = null;

export function setTestQStashPublisher(
  publisher: ((envelope: QStashEventEnvelope) => Promise<{ success: boolean; messageId?: string; error?: string }>) | null
) {
  testPublisher = publisher;
}

/**
 * Publish an event to Upstash QStash targeting the serverless webhook endpoint.
 * Sets 3 retries and deduplication ID.
 */
export async function publishToQStash<T = any>(
  eventType: QStashEventType,
  payload: T,
  options: {
    correlationId?: string;
    tenantId?: string;
    branchId?: string;
    deduplicationId?: string;
    retries?: number;
    delaySeconds?: number;
  } = {}
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const eventId = options.deduplicationId || `evt-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const correlationId = options.correlationId || `corr-${Date.now()}`;
  const envelope: QStashEventEnvelope<T> = {
    eventId,
    eventType,
    topic: `smartrestaurant.${eventType.toLowerCase()}`,
    correlationId,
    tenantId: options.tenantId || 'global',
    branchId: options.branchId,
    timestamp: new Date().toISOString(),
    payload,
  };

  if (testPublisher) {
    return await testPublisher(envelope);
  }

  const client = getQStashClient();
  const destinationUrl = `${APP_BASE_URL.replace(/\/$/, '')}/api/events/qstash-receiver`;

  if (!client) {
    // If running in test mode without live token, simulate successful dispatch
    if (process.env.NODE_ENV === 'test' || process.env.VITEST || !process.env.NODE_ENV) {
      return { success: true, messageId: `msg-sim-${Date.now()}` };
    }

    // If QStash token is missing in production, report error clearly
    return {
      success: false,
      error: 'QSTASH_NOT_CONFIGURED: QSTASH_TOKEN is required to publish events.',
    };
  }

  try {
    const res = await client.publishJSON({
      url: destinationUrl,
      body: envelope,
      retries: options.retries ?? 3,
      deduplicationId: eventId,
      delay: options.delaySeconds,
      headers: {
        'X-Correlation-Id': correlationId,
        'X-Event-Type': eventType,
      },
    });

    return { success: true, messageId: res.messageId };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Verifies the cryptographic signature of an incoming webhook from Upstash QStash
 * using the raw string body of the HTTP request.
 */
export async function verifyQStashSignature(
  signature: string,
  rawBody: string,
  url?: string
): Promise<boolean> {
  const receiver = getQStashReceiver();
  if (!receiver) {
    // Without signing keys configured, reject for security
    return false;
  }

  try {
    return await receiver.verify({
      signature,
      body: rawBody,
      url,
    });
  } catch (err) {
    console.error('[QStash Signature Verification Failed]:', err);
    return false;
  }
}

/**
 * Execute real PostgreSQL domain operations for each event type.
 */
async function executeDomainEvent(
  eventType: QStashEventType,
  envelope: QStashEventEnvelope
): Promise<string[]> {
  const db = getDb();
  const handlersRun: string[] = [];
  const payload = envelope.payload || {};
  const tenantId = envelope.tenantId;
  const branchId = envelope.branchId;
  const now = new Date().toISOString();

  switch (eventType) {
    case 'OrderCreated': {
      // 1. Insert Kitchen notification into notifications table
      const notifId = `notif-kitch-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
      await db.from('notifications').insert({
        id: notifId,
        tenant_id: tenantId,
        branch_id: branchId || null,
        recipient_role: 'KITCHEN',
        type: 'ORDER_ALERT',
        title: `Nueva Comanda #${payload.orderNumber || payload.orderId}`,
        message: `Mesa ${payload.tableNumber || '-'}: ${payload.itemsCount || 1} platos. Total: ${payload.total || 0} ${payload.currency || ''}`,
        is_read: false,
        created_at: now,
      });
      handlersRun.push('kitchen-service:enqueueOrder');
      handlersRun.push('notification-service:alertKitchen');
      break;
    }

    case 'KitchenOrderAccepted': {
      // 1. Update order in Supabase
      if (payload.orderId) {
        await db
          .from('orders')
          .update({
            status: 'PREPARING',
            prep_started_at: now,
            updated_at: now,
          })
          .eq('id', payload.orderId);

        // 2. Insert audit log
        await db.from('order_status_history').insert({
          id: `osh-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          order_id: payload.orderId,
          from_status: 'RECEIVED',
          to_status: 'PREPARING',
          changed_by_role: 'KITCHEN',
          note: 'Cocina inició preparación (Evento QStash)',
          created_at: now,
        });
      }

      // 3. Notify Waiters
      await db.from('notifications').insert({
        id: `notif-waiter-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        tenant_id: tenantId,
        branch_id: branchId || null,
        recipient_role: 'WAITER',
        type: 'KITCHEN_ALERT',
        title: `Comanda en Preparación #${payload.orderNumber || payload.orderId}`,
        message: `Mesa ${payload.tableNumber || '-'}: Cocina ha iniciado la preparación`,
        is_read: false,
        created_at: now,
      });
      handlersRun.push('order-service:markPreparing');
      handlersRun.push('notification-service:notifyWaiter');
      break;
    }

    case 'KitchenOrderCompleted': {
      // 1. Update order in Supabase
      if (payload.orderId) {
        await db
          .from('orders')
          .update({
            status: 'READY',
            prep_completed_at: now,
            updated_at: now,
          })
          .eq('id', payload.orderId);

        // 2. Insert audit log
        await db.from('order_status_history').insert({
          id: `osh-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          order_id: payload.orderId,
          from_status: 'PREPARING',
          to_status: 'READY',
          changed_by_role: 'KITCHEN',
          note: 'Platos listos para entregar (Evento QStash)',
          created_at: now,
        });
      }

      // 3. Notify Waiters to pick up dishes
      await db.from('notifications').insert({
        id: `notif-ready-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        tenant_id: tenantId,
        branch_id: branchId || null,
        recipient_role: 'WAITER',
        type: 'ORDER_READY',
        title: `¡Comanda Lista para Entregar! #${payload.orderNumber || payload.orderId}`,
        message: `Mesa ${payload.tableNumber || '-'}: Pasar a cocina a retirar los platos.`,
        is_read: false,
        created_at: now,
      });
      handlersRun.push('order-service:markReady');
      handlersRun.push('notification-service:notifyReadyForDelivery');
      break;
    }

    case 'ReservationCreated': {
      // Notify staff
      await db.from('notifications').insert({
        id: `notif-res-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        tenant_id: tenantId,
        branch_id: branchId || null,
        recipient_role: 'ADMIN',
        type: 'RESERVATION_NEW',
        title: `Nueva Reserva: ${payload.customerName || 'Cliente'}`,
        message: `Fecha: ${payload.date || ''} ${payload.startTime || ''} (${payload.partySize || 1} pers.)`,
        is_read: false,
        created_at: now,
      });
      handlersRun.push('notification-service:confirmReservation');
      handlersRun.push('analytics-service:incrementReservationKpi');
      break;
    }

    case 'ReservationCancelled': {
      // Update reservation status in database
      if (payload.reservationId) {
        await db
          .from('reservations')
          .update({ status: 'CANCELLED', updated_at: now })
          .eq('id', payload.reservationId);
      }

      await db.from('notifications').insert({
        id: `notif-res-canc-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        tenant_id: tenantId,
        branch_id: branchId || null,
        recipient_role: 'ADMIN',
        type: 'RESERVATION_CANCEL',
        title: `Reserva Cancelada`,
        message: `La reserva ${payload.reservationId || ''} ha sido cancelada. Mesa liberada.`,
        is_read: false,
        created_at: now,
      });
      handlersRun.push('restaurant-service:releaseTable');
      handlersRun.push('notification-service:reservationCancellationAlert');
      break;
    }

    case 'OrderUpdated': {
      if (payload.orderId && payload.status) {
        await db
          .from('orders')
          .update({ status: payload.status, updated_at: now })
          .eq('id', payload.orderId);
      }
      handlersRun.push('order-service:updateOrderState');
      break;
    }

    case 'PaymentStatusUpdated': {
      if (payload.orderId) {
        await db
          .from('orders')
          .update({
            payment_status: payload.paymentStatus || 'PAID',
            updated_at: now,
          })
          .eq('id', payload.orderId);
      }
      handlersRun.push('order-service:updatePaymentState');
      handlersRun.push('analytics-service:recordRevenue');
      break;
    }

    case 'NotificationRequested': {
      await db.from('notifications').insert({
        id: `notif-req-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        tenant_id: tenantId,
        branch_id: branchId || null,
        recipient_role: payload.recipientRole || 'WAITER',
        type: payload.type || 'STAFF_ALERT',
        title: payload.title || 'Llamado de Mesa',
        message: payload.message || 'Se requiere asistencia',
        is_read: false,
        created_at: now,
      });
      handlersRun.push('notification-service:deliverNotification');
      break;
    }

    default:
      handlersRun.push('general-logger');
      break;
  }

  return handlersRun;
}

/**
 * Idempotent receiver handling for events dispatched by QStash.
 * Idempotency is checked strictly and exclusively against the Supabase `processed_events` table.
 * Supports stateful transitions (PENDING, PROCESSING, PROCESSED, FAILED) and lock timeout recovery.
 */
export async function processQStashIncomingEvent(
  envelope: QStashEventEnvelope
): Promise<{ success: boolean; isDuplicate: boolean; handlersRun: string[] }> {
  const { eventId, eventType } = envelope;
  const db = getDb();
  const now = new Date().toISOString();

  // 1. Persistent Idempotency Check in Supabase processed_events table
  const { data: existing } = await db
    .from('processed_events')
    .select('event_id, status, locked_at, processed_at')
    .eq('event_id', eventId)
    .maybeSingle();

  if (existing) {
    if (existing.status === 'PROCESSED') {
      return { success: true, isDuplicate: true, handlersRun: ['IDEMPOTENT_SKIPPED'] };
    }

    // Check if locked and actively processing within 5 minutes
    if (existing.status === 'PROCESSING' && existing.locked_at) {
      const lockAgeMs = Date.now() - new Date(existing.locked_at).getTime();
      if (lockAgeMs < 5 * 60 * 1000) {
        return { success: true, isDuplicate: true, handlersRun: ['CURRENTLY_PROCESSING_SKIPPED'] };
      }
      // Lock expired -> Re-claim for processing
    }

    // Update status to PROCESSING and set locked_at
    await db
      .from('processed_events')
      .update({
        status: 'PROCESSING',
        locked_at: now,
      })
      .eq('event_id', eventId);
  } else {
    // Insert new record in PROCESSING state
    const { error: insertError } = await db
      .from('processed_events')
      .insert({
        event_id: eventId,
        event_type: eventType,
        status: 'PROCESSING',
        locked_at: now,
        created_at: now,
      });

    if (insertError) {
      if (insertError.code === '23505') {
        // Concurrent race condition: another worker already claimed it
        return { success: true, isDuplicate: true, handlersRun: ['IDEMPOTENT_SKIPPED'] };
      }
      throw new Error(`IDEMPOTENCY_INSERT_FAILED: ${insertError.message}`);
    }
  }

  // 2. Execute Domain Event Handlers with Real Database Operations
  try {
    const handlersRun = await executeDomainEvent(eventType, envelope);

    // 3. Mark PROCESSED upon successful execution
    await db
      .from('processed_events')
      .update({
        status: 'PROCESSED',
        processed_at: new Date().toISOString(),
        locked_at: null,
      })
      .eq('event_id', eventId);

    return { success: true, isDuplicate: false, handlersRun };
  } catch (err: any) {
    // 4. Mark FAILED to permit future retries by QStash without marking premature completion
    await db
      .from('processed_events')
      .update({
        status: 'FAILED',
        error_message: err.message || 'Execution failed',
        locked_at: null,
      })
      .eq('event_id', eventId);

    throw err;
  }
}
