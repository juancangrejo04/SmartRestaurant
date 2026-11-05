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

  const client = getQStashClient();
  const destinationUrl = `${APP_BASE_URL.replace(/\/$/, '')}/api/events/qstash-receiver`;

  if (!client) {
    // If QStash token is missing in the environment, report error clearly
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
 * Idempotent receiver handling for events dispatched by QStash.
 * Idempotency is checked strictly and exclusively against the Supabase `processed_events` table.
 * No Sets, Maps or in-memory arrays are used.
 */
export async function processQStashIncomingEvent(
  envelope: QStashEventEnvelope
): Promise<{ success: boolean; isDuplicate: boolean; handlersRun: string[] }> {
  const { eventId, eventType } = envelope;
  const db = getDb();

  // 1. Persistent Idempotency Check in Supabase processed_events table
  const { data: existing } = await db
    .from('processed_events')
    .select('event_id')
    .eq('event_id', eventId)
    .maybeSingle();

  if (existing) {
    return { success: true, isDuplicate: true, handlersRun: ['IDEMPOTENT_SKIPPED'] };
  }

  // 2. Persist to processed_events
  const { error: insertError } = await db
    .from('processed_events')
    .insert({
      event_id: eventId,
      event_type: eventType,
      processed_at: new Date().toISOString(),
    });

  if (insertError) {
    // If concurrent insert occurred, treat as duplicate
    if (insertError.code === '23505') {
      return { success: true, isDuplicate: true, handlersRun: ['IDEMPOTENT_SKIPPED'] };
    }
    throw new Error(`IDEMPOTENCY_INSERT_FAILED: ${insertError.message}`);
  }

  // 3. Dispatch to Domain Handlers
  const handlersRun: string[] = [];

  switch (eventType) {
    case 'OrderCreated':
      handlersRun.push('kitchen-service:enqueueOrder');
      handlersRun.push('notification-service:alertKitchen');
      handlersRun.push('analytics-service:recordOrder');
      break;

    case 'KitchenOrderAccepted':
      handlersRun.push('notification-service:notifyWaiter');
      handlersRun.push('analytics-service:startPrepTimer');
      break;

    case 'KitchenOrderCompleted':
      handlersRun.push('notification-service:notifyReadyForDelivery');
      handlersRun.push('order-service:markReady');
      break;

    case 'ReservationCreated':
      handlersRun.push('notification-service:confirmReservation');
      handlersRun.push('analytics-service:incrementReservationKpi');
      break;

    case 'ReservationCancelled':
      handlersRun.push('restaurant-service:releaseTable');
      handlersRun.push('notification-service:reservationCancellationAlert');
      break;

    case 'PaymentStatusUpdated':
      handlersRun.push('order-service:updatePaymentState');
      handlersRun.push('analytics-service:recordRevenue');
      break;

    case 'NotificationRequested':
      handlersRun.push('notification-service:deliverNotification');
      break;

    default:
      handlersRun.push('general-logger');
      break;
  }

  return { success: true, isDuplicate: false, handlersRun };
}
