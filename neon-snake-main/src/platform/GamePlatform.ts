import type { GameSnapshot } from '../game/types';
import type { RunEndReason } from '../application/gameEvents';

export interface GamePlatform {
  ready(): void;
  start(level: number): Promise<void>;
  end(reason: RunEndReason, snapshot: GameSnapshot, durationMs: number, levelScore: number): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  score(score: number, level: number): void;
  progress(progress: number): void;
  muted(muted: boolean): void;
}
