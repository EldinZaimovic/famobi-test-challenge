import type { AnalyticsSink, GameplayEvent } from '../core/analytics/GameplayAnalytics';

const KEY = 'neon-snake:outbox:v1';
const LIMIT = 200;

/** Bounded, persistent outbox. At-least-once delivery while the page is open. */
export class HttpAnalyticsSink implements AnalyticsSink {
  private queue: GameplayEvent[] = [];
  private inFlight = false;
  private retryMs = 1000;
  private disposed = false;
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly storage: Pick<Storage, 'getItem' | 'setItem'>,
    private readonly send: typeof fetch = (input, init) => fetch(input, init),
    private readonly endpoint = '/api/events'
  ) {
    try {
      const saved: unknown = JSON.parse(storage.getItem(KEY) ?? '[]');
      if (Array.isArray(saved))
        this.queue = saved.filter((e) => e && typeof e.eventId === 'string').slice(-LIMIT);
    } catch {
      /* Storage can be unavailable. Keep an in-memory queue. */
    }
  }

  record(event: GameplayEvent): void {
    this.queue.push(event);
    if (this.queue.length > LIMIT) this.queue.splice(0, this.queue.length - LIMIT);
    this.persist();
    // Defer network work until after the synchronous gameplay transition.
    this.schedule(0);
  }

  private persist(): void {
    try {
      this.storage.setItem(KEY, JSON.stringify(this.queue));
    } catch {
      /* Gameplay must continue. */
    }
  }

  private schedule(delay: number): void {
    if (this.disposed || this.timer !== undefined) return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.flush();
    }, delay);
  }

  async flush(): Promise<void> {
    if (this.inFlight || !this.queue.length) return;
    this.inFlight = true;
    // One event makes a malformed/conflicting event unable to poison other events.
    const event = this.queue[0];
    let delay = 0;
    try {
      const response = await this.send(this.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ events: [event] }),
        keepalive: true,
        signal: AbortSignal.timeout(8000)
      });
      if (response.ok || [400, 409, 413, 415].includes(response.status)) {
        if (!response.ok) console.warn('Analytics event rejected:', response.status, event.eventId);
        this.queue = this.queue.filter((e) => e.eventId !== event.eventId);
        this.persist();
        this.retryMs = 1000;
      } else throw new Error('Collector unavailable');
    } catch (error) {
      if (this.retryMs === 1000) console.warn('Analytics delivery paused; queued events will retry.', error);
      delay = this.retryMs;
      this.retryMs = Math.min(30_000, this.retryMs * 2);
    } finally {
      this.inFlight = false;
      if (this.queue.length) this.schedule(delay);
    }
  }

  /** Best effort on departure; retain until an acknowledged normal request. */
  flushOnDeparture(): void {
    const events = this.queue.slice(0, 50);
    if (!events.length) return;
    try {
      void this.send(this.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ events }),
        keepalive: true
      }).catch(() => {});
    } catch {
      /* Keep the durable outbox for the next visit. */
    }
  }

  dispose(): void {
    this.disposed = true;
    clearTimeout(this.timer);
    this.timer = undefined;
  }
}
