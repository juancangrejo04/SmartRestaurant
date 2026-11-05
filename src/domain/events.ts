// Client-side Distributed Utilities & UI Reactivity
// Note: Backend asynchronous messaging uses Upstash QStash + Supabase Transactional Outbox.
// This file only provides correlation ID tracing and client-side UI notifications.

export function generateCorrelationId(prefix = 'tx'): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).substring(2, 7);
  return `${prefix}-${ts}-${rand}`;
}

// Client-side UI notifier strictly for instant React view re-renders within the browser tab.
// Backend events are durably persisted in Supabase 'outbox_events' and delivered via QStash webhooks.
type UiEventListener = (event?: any) => void;

class ClientUiNotifier {
  private listeners: Set<UiEventListener> = new Set();

  publish(event?: any): void {
    this.listeners.forEach((fn) => {
      try {
        fn(event);
      } catch (err) {
        console.warn('UI component notification warning:', err);
      }
    });
  }

  subscribeAll(callback: UiEventListener): () => void {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }
}

export const eventBus = new ClientUiNotifier();
