import type { GameSnapshot, PauseSource } from '../game/types';

export type RunEndReason = 'complete' | 'fail' | 'quit';

export type GameEventMap = {
  ready: { occurredAt: number };
  runStarted: { level: number; runNumber: number; occurredAt: number };
  runEnded: {
    level: number;
    score: number;
    progress: number;
    reason: RunEndReason;
    durationMs: number;
    occurredAt: number;
  };
  scoreChanged: { level: number; score: number; delta: number };
  progressChanged: { level: number; progress: number; collected: number; target: number };
  pauseChanged: { paused: boolean; source: PauseSource };
  audioChanged: { playerMuted: boolean; systemMuted: boolean; effectiveMuted: boolean };
  gameFinished: { score: number; bestScore: number };
  stateChanged: GameSnapshot;
};
