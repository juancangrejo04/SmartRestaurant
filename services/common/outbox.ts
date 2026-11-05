// Transactional Outbox Pattern — Exclusively using Supabase PostgreSQL and Upstash QStash
import { getDb } from './db';
import { publishToQStash, QStashEventType } from './qstash';
import { OutboxEvent } from '../../src/types';

export interface StageEventInput {
  aggregateType: OutboxEvent['aggregateType'];
  aggregateId: string;
  eventType: OutboxEvent['eventType'];
  tenantId: string;
  branchId?: string;
  correlationId: string;
  payload: Record<string, any>;
}

/**
 * Persist an event into the outbox_events table in Supabase prior to dispatch.
 * Guarantees that business records and outbox events exist in persistent storage.
 */
export async function stageOutboxEvent(
  event: StageEventInput
): Promise<OutboxEvent> {
  const db = getDb();
  const eventId = `evt-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const now = new Date().toISOString();

  const record = {
    id: eventId,
    aggregate_type: event.aggregateType,
    aggregate_id: event.aggregateId,
    event_type: event.eventType,
    payload: event.payload,
    correlation_id: event.correlationId,
    tenant_id: event.tenantId,
    branch_id: event.branchId || null,
    status: 'PENDING',
    retry_count: 0,
    created_at: now,
  };

  const { data, error } = await db
    .from('outbox_events')
    .insert(record)
    .select()
    .single();

  if (error) {
    throw new Error(`OUTBOX_PERSISTENCE_FAILED: ${error.message}`);
  }

  return {
    id: data.id,
    aggregateType: data.aggregate_type,
    aggregateId: data.aggregate_id,
    eventType: data.event_type,
    tenantId: data.tenant_id,
    branchId: data.branch_id,
    correlationId: data.correlation_id,
    schemaVersion: '1.0',
    payload: data.payload,
    createdAt: data.created_at,
    status: 'PENDING',
    retryCount: data.retry_count,
  };
}

/**
 * Polls pending events from Supabase outbox_events and dispatches them to Upstash QStash.
 * Updates publication status to PUBLISHED upon successful receipt.
 */
export async function dispatchPendingOutboxEvents(batchSize: number = 20): Promise<number> {
  const db = getDb();
  let dispatchedCount = 0;

  const { data: pendingEvents, error } = await db
    .from('outbox_events')
    .select('*')
    .eq('status', 'PENDING')
    .order('created_at', { ascending: true })
    .limit(batchSize);

  if (error || !pendingEvents || pendingEvents.length === 0) {
    return 0;
  }

  for (const record of pendingEvents) {
    try {
      const qstashRes = await publishToQStash(
        record.event_type as QStashEventType,
        record.payload,
        {
          correlationId: record.correlation_id,
          tenantId: record.tenant_id,
          branchId: record.branch_id,
          deduplicationId: record.id,
          retries: 3,
        }
      );

      if (qstashRes.success) {
        await db
          .from('outbox_events')
          .update({
            status: 'PUBLISHED',
            published_at: new Date().toISOString(),
          })
          .eq('id', record.id);
        dispatchedCount++;
      } else {
        const nextRetry = (record.retry_count || 0) + 1;
        await db
          .from('outbox_events')
          .update({
            retry_count: nextRetry,
            status: nextRetry >= 5 ? 'FAILED' : 'PENDING',
          })
          .eq('id', record.id);
      }
    } catch {
      const nextRetry = (record.retry_count || 0) + 1;
      await db
        .from('outbox_events')
        .update({
          retry_count: nextRetry,
          status: nextRetry >= 5 ? 'FAILED' : 'PENDING',
        })
        .eq('id', record.id);
    }
  }

  return dispatchedCount;
}

/**
 * Starts an optional polling worker for local development scripts.
 * In production serverless on Vercel, dispatching is invoked per transaction or via QStash cron.
 */
export function startOutboxWorker(intervalMs: number = 3000): { stop: () => void } {
  const timer = setInterval(() => {
    dispatchPendingOutboxEvents(20).catch(() => {});
  }, intervalMs);

  return {
    stop: () => clearInterval(timer),
  };
}
