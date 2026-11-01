// Shared Distributed Systems Contracts & Integration Event Schemas

export type ServiceDomain =
  | 'auth'
  | 'restaurant'
  | 'reservation'
  | 'order'
  | 'kitchen'
  | 'notification'
  | 'analytics';

export type IntegrationEventType =
  | 'ReservationCreated'
  | 'ReservationCancelled'
  | 'OrderCreated'
  | 'OrderConfirmed'
  | 'OrderAcceptedByKitchen'
  | 'OrderStatusChanged'
  | 'OrderReady'
  | 'OrderDelivered';

export interface IntegrationEventEnvelope<T = any> {
  eventId: string;
  eventType: IntegrationEventType;
  schemaVersion: string;
  aggregateType: string;
  aggregateId: string;
  tenantId: string;
  branchId: string;
  correlationId: string;
  timestamp: string; // ISO-8601 UTC
  payload: T;
}

export interface OutboxRecord {
  id: string;
  aggregateType: string;
  aggregateId: string;
  eventType: IntegrationEventType;
  payloadJson: string;
  correlationId: string;
  tenantId: string;
  branchId: string;
  status: 'PENDING' | 'PUBLISHED' | 'FAILED';
  retryCount: number;
  createdAt: string;
  publishedAt?: string;
}

export interface StandardApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  correlationId: string;
  timestamp: string;
}
