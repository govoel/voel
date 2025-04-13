import {
  CLOSED,
  CONNECTING,
  EventSourceClient,
  EventSourceOptions,
  createEventSource,
} from 'eventsource-client';
import { fetch as expoFetch } from 'expo/fetch';

export type MessageEvent = {
  data?: unknown;
  lastEventId?: string;
  type: string;
};

export class ExpoEventSource {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 2;

  readonly CONNECTING = 0;
  readonly OPEN = 1;
  readonly CLOSED = 2;

  private client: EventSourceClient;
  private listeners = new Map<string, Set<(event: MessageEvent) => void>>();

  constructor(url: string, opts?: Omit<EventSourceOptions, 'url'>) {
    this.client = createEventSource({
      ...opts,
      url,
      fetch: (url, init) => expoFetch(typeof url === 'string' ? url : url.toString(), init),
      onConnect: () => {
        this.dispatchEvent('open', { type: 'open' });
      },
      onMessage: (event) => {
        this.dispatchEvent(event.event || 'message', {
          type: event.event || 'message',
          data: event.data,
          lastEventId: event.id,
        });
      },
    });
  }

  get readyState(): number {
    if (this.client.readyState === CLOSED) {
      return ExpoEventSource.CLOSED;
    }
    if (this.client.readyState === CONNECTING) {
      return ExpoEventSource.CONNECTING;
    }
    return ExpoEventSource.OPEN;
  }

  get url(): string {
    return this.client.url;
  }

  get lastEventId(): string | undefined {
    return this.client.lastEventId;
  }

  close() {
    this.client.close();
  }

  addEventListener(type: string, handler: (event: MessageEvent) => void) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(handler);
  }

  removeEventListener(type: string, handler: (event: MessageEvent) => void) {
    const handlers = this.listeners.get(type);
    if (handlers) {
      handlers.delete(handler);
    }
  }

  dispatchEvent(type: string, event: MessageEvent) {
    const handlers = this.listeners.get(type);
    if (handlers) {
      for (const handler of handlers) {
        handler.call(this, event);
      }
    }
  }
}
