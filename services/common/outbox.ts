// Transactional Outbox Pattern Implementation with PostgreSQL & RabbitMQ Dispatcher
import { query, TransactionClient } from './db';
import { publishToExchange } from './rabbitmq';
import { OutboxEvent } from '../../src/types';

export interface StageEventInput {
  aggregateType: OutboxEvent['aggregateType'];
  aggregateId: string;
  eventType: OutboxEvent['eventType'];
  tenantId: string;
  branchId: string;
  correlationId: string;
  payload: Record<string, any>;
}

/**
 * Stage an event in the outbox table within the same ACID transaction context
 */
export async function stageOutboxEvent(
  client: TransactionClient,
  event: StageEventInput
): Promise<OutboxEvent> {
  const eventId = `evt-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const now = new Date().toISOString();

  await client.query(
    `INSERT INTO outbox_events (
      id, aggregate_type, aggregate_id, event_type, tenant_id, branch_id, correlation_id, schema_version, payload, status, retry_count, created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
    [
      eventId,
      event.aggregateType,
      event.aggregateId,
      event.eventType,
      event.tenantId,
      event.branchId,
      event.correlationId,
      '1.0',
      event.payload,
      'PENDING',
      0,
      now,
    ]
  );

  return {
    id: eventId,
    aggregateType: event.aggregateType,
    aggregateId: event.aggregateId,
    eventType: event.eventType,
    tenantId: event.tenantId,
    branchId: event.branchId,
    correlationId: event.correlationId,
    schemaVersion: '1.0',
    payload: event.payload,
    createdAt: now,
    status: 'PENDING',
    retryCount: 0,
  };
}

/**
 * Polls pending events from PostgreSQL and dispatches them to RabbitMQ Topic Exchange
 */
export async function dispatchPendingOutboxEvents(batchSize: number = 20): Promise<number> {
  let dispatchedCount = 0;

  try {
    const { rows: pendingEvents } = await query(
      `SELECT * FROM outbox_events WHERE status = $1 ORDER BY created_at ASC LIMIT $2`,
      ['PENDING', batchSize]
    );

    for (const record of pendingEvents) {
      try {
        const routingKey = `${record.aggregate_type.toLowerCase()}.${record.event_type.toLowerCase()}`;
        const payload = typeof record.payload === 'string' ? JSON.parse(record.payload) : record.payload;

        const published = await publishToExchange(routingKey, {
          eventId: record.id,
          aggregateType: record.aggregate_type,
          aggregateId: record.aggregate_id,
          eventType: record.event_type,
          tenantId: record.tenant_id,
          branchId: record.branch_id,
          correlationId: record.correlation_id,
          payload,
          timestamp: record.created_at,
        }, record.correlation_id);

        if (published) {
          await query(
            `UPDATE outbox_events SET status = $1, published_at = $2 WHERE id = $3`,
            ['PUBLISHED', new Date().toISOString(), record.id]
          );
          dispatchedCount++;
        } else {
          await query(
            `UPDATE outbox_events SET retry_count = retry_count + 1, status = CASE WHEN retry_count >= 5 THEN 'FAILED' ELSE 'PENDING' END WHERE id = $1`,
            [record.id]
          );
        }
      } catch (publishErr) {
        await query(
          `UPDATE outbox_events SET retry_count = retry_count + 1, status = CASE WHEN retry_count >= 5 THEN 'FAILED' ELSE 'PENDING' END WHERE id = $1`,
          [record.id]
        );
      }
    }
  } catch (err: any) {
    console.warn('[Outbox Dispatcher Warning]:', err.message);
  }

  return dispatchedCount;
}

let outboxWorkerInterval: NodeJS.Timeout | null = null;

export function startOutboxWorker(intervalMs: number = 2500): void {
  if (outboxWorkerInterval) return;

  outboxWorkerInterval = setInterval(async () => {
    await dispatchPendingOutboxEvents(25);
  }, intervalMs);
}
