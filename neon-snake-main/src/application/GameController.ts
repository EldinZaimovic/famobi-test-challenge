import type { GamePlatform } from '../platform/GamePlatform';
import type { GameplayAnalytics, LeaveReason } from '../core/analytics/GameplayAnalytics';
import { GameAudio } from '../core/audio/GameAudio';
import { EventBus } from '../core/events/EventBus';
import type { GameStorage, PlayerProfile } from '../core/storage/GameStorage';
import { LEVELS } from '../game/levels';
import { SnakeGame } from '../game/snakeGame';
import type { Direction, GameListener, GameSnapshot, PauseSource } from '../game/types';
import type { GameEventMap, RunEndReason } from './gameEvents';

type Transition = 'starting' | 'ending' | 'pausing' | 'resuming';

export class GameController {
  readonly events = new EventBus<GameEventMap>();

  private readonly audio: GameAudio;
  private readonly unsubscribe: () => void;
  private profile: PlayerProfile;
  private previousSnapshot: GameSnapshot;
  private run: { startedAt: number; initialScore: number } | null = null;
  private playerPauseActive = false;
  private systemPauseActive = false;
  private systemMuted = false;
  private ready = false;
  private disposed = false;
  private pendingTransition: Transition | null = null;
  private transitionError: string | null = null;
  private listeners = new Set<GameListener>();

  constructor(
    private readonly simulation: SnakeGame,
    private readonly storage: GameStorage,
    private readonly platform: GamePlatform,
    private readonly playerPauseEnabled = true,
    private readonly analytics?: GameplayAnalytics
  ) {
    this.profile = storage.loadProfile();
    this.audio = new GameAudio(this.profile.playerMuted);
    this.previousSnapshot = simulation.getSnapshot();
    this.unsubscribe = simulation.subscribe(this.handleSnapshot);
  }

  getSnapshot(): GameSnapshot {
    return this.simulation.getSnapshot();
  }

  getProfile(): Readonly<PlayerProfile> {
    return this.profile;
  }

  getAudioState(): { playerMuted: boolean; systemMuted: boolean; effectiveMuted: boolean } {
    return {
      playerMuted: this.audio.isPlayerMuted,
      systemMuted: this.systemMuted,
      effectiveMuted: this.audio.isEffectivelyMuted
    };
  }

  subscribe(listener: GameListener): () => void {
    this.listeners.add(listener);
    listener(this.getSnapshot());
    return () => {
      this.listeners.delete(listener);
    };
  }

  markReady(): void {
    if (this.ready) return;
    this.ready = true;
    this.notify();
    this.events.emit('ready', { occurredAt: Date.now() });
    this.platform.ready();
  }

  isReady(): boolean {
    return this.ready;
  }
  isBusy(): boolean {
    return this.pendingTransition !== null;
  }
  getTransitionError(): string | null {
    return this.transitionError;
  }
  isSystemPaused(): boolean {
    return this.systemPauseActive;
  }

  canAdvance(): boolean {
    return (
      this.ready &&
      !this.disposed &&
      !this.transitionError &&
      !this.systemPauseActive &&
      this.getSnapshot().phase === 'playing' &&
      (this.pendingTransition === null || this.pendingTransition === 'pausing')
    );
  }

  startNewGame(): Promise<void> {
    return this.startRun(1, () => this.simulation.start());
  }

  startAtLevel(level: number): Promise<void> {
    if (level > this.profile.highestUnlockedLevel) return Promise.resolve();
    return this.goToLevel(level);
  }

  goToLevel(level: number): Promise<void> {
    if (!Number.isInteger(level) || level < 1 || level > LEVELS.length) return Promise.resolve();
    return this.startRun(level, () => this.simulation.startAtLevel(level));
  }

  restartLevel(): Promise<void> {
    return this.startRun(this.getSnapshot().level, () => this.simulation.restartLevel(), 'restart');
  }

  goToNextLevel(): Promise<void> {
    const snapshot = this.getSnapshot();
    if (snapshot.phase !== 'level-complete') return Promise.resolve();
    return this.startRun(snapshot.level + 1, () => this.simulation.nextLevel());
  }

  quitToMenu(): Promise<void> {
    return this.transition('ending', async () => {
      await this.endRun('quit');
      this.playerPauseActive = false;
      this.simulation.quitToMenu();
    });
  }

  forceGameOver(): Promise<void> {
    return this.transition('ending', async () => {
      this.simulation.forceGameOver();
      await this.finishLevel();
    });
  }

  move(direction: Direction): void {
    if (this.canAdvance()) this.simulation.setDirection(direction);
  }

  tick(): void {
    if (!this.canAdvance()) return;
    this.simulation.step();
    if (this.getSnapshot().phase !== 'playing' && !this.isBusy()) {
      void this.transition('ending', () => this.finishLevel());
    }
  }

  togglePlayerPause(): Promise<void> {
    const phase = this.getSnapshot().phase;
    if (!this.playerPauseEnabled || this.systemPauseActive || (phase !== 'playing' && phase !== 'paused')) {
      return Promise.resolve();
    }
    const paused = !this.playerPauseActive;
    return this.transition(paused ? 'pausing' : 'resuming', async () => {
      if (paused) await this.platform.pause();
      else await this.platform.resume();
      if (this.disposed) return;
      // The snake can finish or collide while a pause acknowledgment is pending.
      await this.finishLevel();
      if (!this.run) return;
      this.playerPauseActive = paused;
      this.reconcilePauseState();
    });
  }

  private startRun(level: number, start: () => void, leaveReason: LeaveReason = 'replaced'): Promise<void> {
    if (this.systemPauseActive) return Promise.resolve();
    return this.transition('starting', async () => {
      await this.endRun('quit', leaveReason);
      if (this.disposed) return;
      await this.platform.start(level);
      if (this.disposed) return;
      this.playerPauseActive = false;
      start();
      const snapshot = this.getSnapshot();
      this.run = { startedAt: Date.now(), initialScore: snapshot.score };
      this.analytics?.start(snapshot);
      this.profile = { ...this.profile, totalRuns: this.profile.totalRuns + 1 };
      this.storage.saveProfile(this.profile);
      this.platform.score(snapshot.score, level);
      this.platform.progress(0);
      this.events.emit('runStarted', {
        level,
        runNumber: this.profile.totalRuns,
        occurredAt: this.run.startedAt
      });
      // Starting must preserve an external pause received during the SDK call.
      this.reconcilePauseState();
      this.audio.play('start');
    });
  }

  private async endRun(reason: RunEndReason, leaveReason: LeaveReason = 'menu'): Promise<void> {
    if (!this.run) return;
    const snapshot = this.getSnapshot();
    const occurredAt = Date.now();
    const durationMs = Math.max(0, occurredAt - this.run.startedAt);
    const levelScore = snapshot.score - this.run.initialScore;
    this.run = null;
    this.analytics?.end(
      snapshot,
      reason === 'complete' ? 'completed' : reason === 'fail' ? 'failed' : 'left',
      leaveReason
    );
    await this.platform.end(reason, snapshot, durationMs, levelScore);
    if (reason === 'complete') {
      this.profile.highestUnlockedLevel = Math.max(
        this.profile.highestUnlockedLevel,
        Math.min(LEVELS.length, snapshot.level + 1)
      );
      this.storage.saveProfile(this.profile);
      this.audio.play(snapshot.phase === 'finished' ? 'finished' : 'level-complete');
    } else if (reason === 'fail') {
      this.audio.play('game-over');
    }
    this.events.emit('runEnded', {
      level: snapshot.level,
      score: snapshot.score,
      progress: snapshot.progress,
      reason,
      durationMs,
      occurredAt
    });
    if (snapshot.phase === 'finished') {
      this.events.emit('gameFinished', { score: snapshot.score, bestScore: this.profile.bestScore });
    }
  }

  private async finishLevel(): Promise<void> {
    const phase = this.getSnapshot().phase;
    if (phase === 'game-over') await this.endRun('fail');
    else if (phase === 'level-complete' || phase === 'finished') await this.endRun('complete');
  }

  private async transition(kind: Transition, action: () => Promise<void>): Promise<void> {
    if (this.disposed || !this.ready || this.isBusy() || this.transitionError) return;
    this.pendingTransition = kind;
    this.notify();
    try {
      await action();
    } catch (error) {
      console.error('Game transition failed', error);
      this.transitionError = 'The game connection was interrupted. Reload to try again.';
    } finally {
      this.pendingTransition = null;
      this.notify();
    }
  }

  setSystemPaused(paused: boolean): void {
    if (this.systemPauseActive === paused) return;
    this.systemPauseActive = paused;
    this.reconcilePauseState();
    this.notify();
  }

  togglePlayerMuted(): void {
    this.setPlayerMuted(!this.audio.isPlayerMuted);
  }

  setPlayerMuted(muted: boolean): void {
    if (this.audio.isPlayerMuted === muted) return;
    this.audio.setPlayerMuted(muted);
    this.profile = { ...this.profile, playerMuted: muted };
    this.storage.saveProfile(this.profile);
    this.events.emit('audioChanged', this.getAudioState());
    this.platform.muted(muted);
  }

  setSystemMuted(muted: boolean): void {
    if (this.systemMuted === muted) return;
    this.systemMuted = muted;
    this.audio.setSystemMuted(muted);
    this.events.emit('audioChanged', this.getAudioState());
  }

  dispose(reason: LeaveReason = 'disposed'): void {
    if (this.disposed) return;
    this.disposed = true;
    const snapshot = this.getSnapshot();
    this.analytics?.end(
      snapshot,
      snapshot.phase === 'game-over' ? 'failed' :
        snapshot.phase === 'level-complete' || snapshot.phase === 'finished' ? 'completed' : 'left',
      reason
    );
    this.run = null;
    this.unsubscribe();
    this.audio.dispose();
    this.events.clear();
    this.listeners.clear();
  }

  private handleSnapshot = (snapshot: GameSnapshot): void => {
    const previous = this.previousSnapshot;
    this.previousSnapshot = snapshot;
    // Start/reset values are reported explicitly by startRun after SDK acknowledgment.
    if (this.pendingTransition === 'starting') return;

    if (this.run && (snapshot.score !== previous.score || snapshot.progress !== previous.progress)) {
      this.analytics?.progress(snapshot);
    }
    // Capture the actual terminal moment, including collisions during an SDK pause wait.
    if (
      this.run &&
      (snapshot.phase === 'game-over' || snapshot.phase === 'level-complete' || snapshot.phase === 'finished')
    ) {
      this.analytics?.end(snapshot, snapshot.phase === 'game-over' ? 'failed' : 'completed');
    }

    if (snapshot.score !== previous.score) {
      const delta = snapshot.score - previous.score;
      if (delta > 0) this.audio.play('fruit');
      if (snapshot.score > this.profile.bestScore) {
        this.profile = { ...this.profile, bestScore: snapshot.score };
        this.storage.saveProfile(this.profile);
      }
      this.platform.score(snapshot.score, snapshot.level);
      this.events.emit('scoreChanged', { level: snapshot.level, score: snapshot.score, delta });
    }
    if (snapshot.progress !== previous.progress || snapshot.level !== previous.level) {
      this.platform.progress(snapshot.progress);
      this.events.emit('progressChanged', {
        level: snapshot.level,
        progress: snapshot.progress,
        collected: snapshot.fruitEaten,
        target: snapshot.target
      });
    }
    if (
      snapshot.pauseSource !== previous.pauseSource ||
      (snapshot.phase === 'paused') !== (previous.phase === 'paused')
    ) {
      this.events.emit('pauseChanged', { paused: snapshot.phase === 'paused', source: snapshot.pauseSource });
    }
    this.events.emit('stateChanged', snapshot);
    // tick() reports natural endings before the UI displays their result screen.
    if (snapshot.phase === 'playing' || snapshot.phase === 'paused' || !this.run) this.notify();
  };

  private reconcilePauseState(): void {
    const source: PauseSource = this.systemPauseActive ? 'system' : this.playerPauseActive ? 'player' : null;
    if (source) this.simulation.pause(source);
    else this.simulation.resume();
  }

  private notify(): void {
    const snapshot = this.getSnapshot();
    this.listeners.forEach((listener) => listener(snapshot));
  }
}
