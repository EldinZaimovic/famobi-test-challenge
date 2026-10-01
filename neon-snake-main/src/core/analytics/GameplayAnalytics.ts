import type { GameSnapshot } from '../../game/types';

export type GameplayOutcome = 'completed' | 'failed' | 'left';
export type LeaveReason = 'menu' | 'restart' | 'replaced' | 'page_exit' | 'disposed';

type EventData = {
  schemaVersion: 1;
  eventId: string;
  attemptId: string;
  occurredAt: number;
  level: number;
  score: number;
  levelScore: number;
  progress: number;
  fruitEaten: number;
  target: number;
  durationMs: number;
};

export type GameplayEvent = EventData & (
  | { name: 'gameplay_started' | 'gameplay_progress' }
  | {
      name: 'gameplay_ended';
      outcome: GameplayOutcome;
      leaveReason: LeaveReason | null;
      failureReason: GameSnapshot['failureReason'];
    }
);

export interface AnalyticsSink {
  record(event: GameplayEvent): void | Promise<void>;
}

type AnalyticsRuntime = {
  now(): number;
  monotonicNow(): number;
  id(): string;
};

/** One attempt per level entry/retry. Analytics must never control gameplay. */
export class GameplayAnalytics {
  private attempt: { id: string; startedAt: number; initialScore: number; sequence: number } | null = null;

  constructor(
    private readonly sink: AnalyticsSink,
    private readonly runtime: AnalyticsRuntime = {
      now: () => Date.now(),
      monotonicNow: () => performance.now(),
      id: () => crypto.randomUUID()
    }
  ) {}

  start(snapshot: GameSnapshot): void {
    this.safely(() => {
      if (this.attempt) return;
      this.attempt = {
        id: this.runtime.id(),
        startedAt: this.runtime.monotonicNow(),
        initialScore: snapshot.score,
        sequence: 0
      };
      this.record({ ...this.data(snapshot), name: 'gameplay_started' });
    });
  }

  progress(snapshot: GameSnapshot): void {
    this.safely(() => {
      if (this.attempt) this.record({ ...this.data(snapshot), name: 'gameplay_progress' });
    });
  }

  end(snapshot: GameSnapshot, outcome: GameplayOutcome, leaveReason: LeaveReason | null = null): void {
    this.safely(() => {
      if (!this.attempt) return;
      const event: GameplayEvent = {
        ...this.data(snapshot),
        name: 'gameplay_ended',
        outcome,
        leaveReason: outcome === 'left' ? leaveReason : null,
        failureReason: outcome === 'failed' ? snapshot.failureReason : null
      };
      // Close before calling the sink so failures/re-entrancy cannot duplicate ends.
      this.attempt = null;
      this.record(event);
    });
  }

  private data(snapshot: GameSnapshot): EventData {
    const attempt = this.attempt!;
    return {
      schemaVersion: 1,
      eventId: `${attempt.id}:${++attempt.sequence}`,
      attemptId: attempt.id,
      occurredAt: this.runtime.now(),
      level: snapshot.level,
      score: snapshot.score,
      levelScore: snapshot.score - attempt.initialScore,
      progress: snapshot.progress,
      fruitEaten: snapshot.fruitEaten,
      target: snapshot.target,
      durationMs: Math.max(0, this.runtime.monotonicNow() - attempt.startedAt)
    };
  }

  private record(event: GameplayEvent): void {
    // Also consume rejected promises from a future remote transport.
    void Promise.resolve(this.sink.record(event)).catch(() => {});
  }

  private safely(action: () => void): void {
    try {
      action();
    } catch {
      // Storage/transport/clock failures are deliberately isolated from the game.
    }
  }
}
