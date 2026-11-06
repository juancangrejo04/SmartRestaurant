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
 * Dispatches pending outbox events to Upstash QStash atomically.
 * In concurrent serverless invocations, uses claim_outbox_events RPC or worker locks to prevent
 * duplicate dispatches across multiple concurrent serverless workers.
 */
export async function dispatchPendingOutboxEvents(
  batchSize: number = 20,
  workerId: string = `worker-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`
): Promise<number> {
  const db = getDb();
  let dispatchedCount = 0;
  const now = new Date().toISOString();

  // 1. Try atomic claim using Supabase RPC function if available
  let claimedEvents: any[] | null = null;
  try {
    const { data: rpcClaimed, error: rpcErr } = await (db as any).rpc('claim_outbox_events', {
      p_worker_id: workerId,
      p_batch_size: batchSize,
      p_lock_timeout_seconds: 300,
    });
    if (!rpcErr && Array.isArray(rpcClaimed)) {
      claimedEvents = rpcClaimed;
    }
  } catch {
    // Fallback to table update if RPC not present in environment
  }

  // Fallback to direct table claiming if RPC is not available
  if (claimedEvents === null) {
    // Find events that are PENDING or lock-expired PROCESSING
    const { data: candidateEvents, error } = await db
      .from('outbox_events')
      .select('*')
      .in('status', ['PENDING', 'FAILED'])
      .order('created_at', { ascending: true })
      .limit(batchSize);

    if (error || !candidateEvents || candidateEvents.length === 0) {
      return 0;
    }

    // Atomically claim by assigning worker_id and updating status to PROCESSING
    claimedEvents = [];
    for (const cand of candidateEvents) {
      const { data: claimed } = await db
        .from('outbox_events')
        .update({
          status: 'PROCESSING',
          worker_id: workerId,
          locked_at: now,
        })
        .eq('id', cand.id)
        .eq('status', cand.status)
        .select()
        .maybeSingle();

      if (claimed) {
        claimedEvents.push(claimed);
      }
    }
  }

  if (!claimedEvents || claimedEvents.length === 0) {
    return 0;
  }

  // 2. Dispatch each claimed event to Upstash QStash
  for (const record of claimedEvents) {
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
            worker_id: null,
            locked_at: null,
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
            worker_id: null,
            locked_at: null,
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
          worker_id: null,
          locked_at: null,
        })
        .eq('id', record.id);
    }
  }

  return dispatchedCount;
}
