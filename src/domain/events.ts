// Distributed Asynchronous Event Bus and Outbox Pattern
import { OutboxEvent } from '../types';

export type EventCallback = (event: OutboxEvent) => void;

class DistributedEventBus {
  private subscribers: Map<string, EventCallback[]> = new Map();
  private eventHistory: OutboxEvent[] = [];
  private maxHistory = 100;
  private channel: BroadcastChannel | null = null;

  constructor() {
    // Cross-tab synchronization via BroadcastChannel
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      try {
        this.channel = new BroadcastChannel('smart_restaurant_events_channel');
        this.channel.onmessage = (msgEvent) => {
          if (msgEvent.data && msgEvent.data.eventType) {
            this.dispatchLocally(msgEvent.data);
          }
        };
      } catch (err) {
        console.warn('BroadcastChannel initialization failed, fallback to storage:', err);
      }
    }

    // Cross-window / Cross-tab synchronization via StorageEvent fallback
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', (storageEvent) => {
        if (storageEvent.key === 'sr_last_event' && storageEvent.newValue) {
          try {
            const parsed = JSON.parse(storageEvent.newValue);
            this.dispatchLocally(parsed);
          } catch {
            // ignore JSON error
          }
        } else if (storageEvent.key === 'sr_orders') {
          // Synthetic reload event for orders
          this.dispatchLocally({
            id: `sync-ord-${Date.now()}`,
            eventType: 'OrderStatusChanged',
            aggregateType: 'Order',
            aggregateId: 'storage-sync',
            tenantId: '',
            branchId: '',
            correlationId: 'storage-sync',
            schemaVersion: '1.0',
            payload: {},
            createdAt: new Date().toISOString(),
            status: 'PUBLISHED',
            retryCount: 0,
          });
        }
      });
    }
  }

  public subscribe(eventType: string, callback: EventCallback) {
    if (!this.subscribers.has(eventType)) {
      this.subscribers.set(eventType, []);
    }
    this.subscribers.get(eventType)!.push(callback);
    return () => {
      const list = this.subscribers.get(eventType);
      if (list) {
        this.subscribers.set(
          eventType,
          list.filter((cb) => cb !== callback)
        );
      }
    };
  }

  public subscribeAll(callback: EventCallback) {
    return this.subscribe('*', callback);
  }

  private dispatchLocally(event: OutboxEvent) {
    // Keep in event history for distributed inspection
    this.eventHistory.unshift(event);
    if (this.eventHistory.length > this.maxHistory) {
      this.eventHistory.pop();
    }

    // Call specific listeners
    const specific = this.subscribers.get(event.eventType) || [];
    specific.forEach((cb) => {
      try {
        cb(event);
      } catch (err) {
        console.error(`[EventBus Error] in ${event.eventType} listener:`, err);
      }
    });

    // Call wildcard listeners
    const wildcards = this.subscribers.get('*') || [];
    wildcards.forEach((cb) => {
      try {
        cb(event);
      } catch (err) {
        console.error('[EventBus Wildcard Error]:', err);
      }
    });
  }

  public publish(event: OutboxEvent, broadcast = true) {
    this.dispatchLocally(event);

    if (broadcast && typeof window !== 'undefined') {
      if (this.channel) {
        try {
          this.channel.postMessage(event);
        } catch {
          // ignore
        }
      }
      try {
        localStorage.setItem('sr_last_event', JSON.stringify(event));
      } catch {
        // ignore
      }
    }
  }

  public getHistory(): OutboxEvent[] {
    return [...this.eventHistory];
  }

  public clearHistory() {
    this.eventHistory = [];
  }
}

export const eventBus = new DistributedEventBus();

export function generateCorrelationId(prefix = 'tx'): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).substring(2, 7);
  return `${prefix}-${ts}-${rand}`;
}
