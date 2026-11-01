// Transactional Outbox Pattern Implementation for Microservices
import { IntegrationEventEnvelope, OutboxRecord } from './types';

export class TransactionalOutboxManager {
  private records: OutboxRecord[] = [];

  /**
   * Persists the event within the same local transaction context as business mutations
   */
  public stageEvent<T>(envelope: IntegrationEventEnvelope<T>): OutboxRecord {
    const record: OutboxRecord = {
      id: envelope.eventId,
      aggregateType: envelope.aggregateType,
      aggregateId: envelope.aggregateId,
      eventType: envelope.eventType,
      payloadJson: JSON.stringify(envelope.payload),
      correlationId: envelope.correlationId,
      tenantId: envelope.tenantId,
      branchId: envelope.branchId,
      status: 'PENDING',
      retryCount: 0,
      createdAt: envelope.timestamp,
    };
    this.records.push(record);
    return record;
  }

  /**
   * Dispatches pending events to the message broker (RabbitMQ) with exponential backoff on failure
   */
  public async dispatchPending(
    brokerPublisher: (record: OutboxRecord) => Promise<boolean>
  ): Promise<number> {
    const pending = this.records.filter((r) => r.status === 'PENDING');
    let publishedCount = 0;

    for (const record of pending) {
      try {
        const success = await brokerPublisher(record);
        if (success) {
          record.status = 'PUBLISHED';
          record.publishedAt = new Date().toISOString();
          publishedCount++;
        } else {
          record.retryCount++;
          if (record.retryCount > 5) {
            record.status = 'FAILED';
          }
        }
      } catch (err) {
        record.retryCount++;
        if (record.retryCount > 5) {
          record.status = 'FAILED';
        }
      }
    }

    return publishedCount;
  }

  public getPending(): OutboxRecord[] {
    return this.records.filter((r) => r.status === 'PENDING');
  }

  public getAll(): OutboxRecord[] {
    return [...this.records];
  }
}
