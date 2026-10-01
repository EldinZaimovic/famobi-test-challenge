import type { AnalyticsSink, GameplayEvent } from '../core/analytics/GameplayAnalytics';
import type { FamobiSdk } from './FamobiSdk';

export const ANALYTICS_STORAGE_KEY = 'neon-snake:analytics:v1';
export const ANALYTICS_EVENT_LIMIT = 200;

/** A bounded local journal, separate from the player's profile and SDK telemetry. */
export class FamobiAnalyticsStorage implements AnalyticsSink {
  constructor(private readonly storage: FamobiSdk['storage']) {}

  record(event: GameplayEvent): void {
    let events: unknown[] = [];
    try {
      const raw = this.storage.getItem(ANALYTICS_STORAGE_KEY);
      const value: unknown = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (Array.isArray(value)) events = value;
    } catch {
      // A corrupt or inaccessible journal must not prevent recording new events.
    }
    this.storage.setItem(
      ANALYTICS_STORAGE_KEY,
      JSON.stringify([...events.slice(-(ANALYTICS_EVENT_LIMIT - 1)), event])
    );
  }
}
