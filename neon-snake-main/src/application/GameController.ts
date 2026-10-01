import { GameAudio } from '../core/audio/GameAudio';
import { EventBus } from '../core/events/EventBus';
import type { GameStorage, PlayerProfile } from '../core/storage/GameStorage';
import { LEVELS } from '../game/levels';
import { SnakeGame } from '../game/snakeGame';
import type { Direction, GameListener, GameSnapshot, PauseSource } from '../game/types';
import type { GameEventMap, RunEndReason } from './gameEvents';

const beginsRun = (previous: GameSnapshot, next: GameSnapshot): boolean =>
  next.phase === 'playing' && ['menu', 'level-complete', 'game-over', 'finished'].includes(previous.phase);

const terminalReason = (snapshot: GameSnapshot): RunEndReason | null => {
  if (snapshot.phase === 'level-complete' || snapshot.phase === 'finished') return 'complete';
  if (snapshot.phase === 'game-over') return 'fail';
  if (snapshot.phase === 'menu') return 'quit';
  return null;
};

export class GameController {
  readonly events = new EventBus<GameEventMap>();

  private readonly audio: GameAudio;
  private profile: PlayerProfile;
  private previousSnapshot: GameSnapshot;
  private runStartedAt: number | null = null;
  private playerPauseActive = false;
  private systemPauseActive = false;
  private systemMuted = false;
  private ready = false;

  constructor(
    private readonly simulation: SnakeGame,
    private readonly storage: GameStorage
  ) {
    this.profile = storage.loadProfile();
    this.audio = new GameAudio(this.profile.playerMuted);
    this.previousSnapshot = simulation.getSnapshot();
    simulation.subscribe(this.handleSnapshot);
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
    return this.simulation.subscribe(listener);
  }

  markReady(): void {
    if (this.ready) return;
    this.ready = true;
    this.events.emit('ready', { occurredAt: Date.now() });
  }

  startNewGame(): void {
    this.resetPauseState();
    this.simulation.start();
    this.audio.play('start');
  }

  startAtLevel(level: number): void {
    const highestAllowedLevel = Math.min(this.profile.highestUnlockedLevel, LEVELS.length);
    if (!Number.isInteger(level) || level < 1 || level > highestAllowedLevel) return;
    this.goToLevel(level);
  }

  goToLevel(level: number): void {
    if (!Number.isInteger(level) || level < 1 || level > LEVELS.length) return;
    const snapshot = this.simulation.getSnapshot();
    if (snapshot.phase === 'playing' || snapshot.phase === 'paused') this.simulation.quitToMenu();
    this.resetPauseState();
    this.simulation.startAtLevel(level);
    this.audio.play('start');
  }

  restartLevel(): void {
    const snapshot = this.simulation.getSnapshot();
    if (snapshot.phase === 'playing' || snapshot.phase === 'paused') this.simulation.quitToMenu();
    this.resetPauseState();
    this.simulation.restartLevel();
    this.audio.play('start');
  }

  goToNextLevel(): void {
    const snapshot = this.simulation.getSnapshot();
    if (snapshot.phase === 'playing' || snapshot.phase === 'paused') {
      this.goToLevel(Math.min(LEVELS.length, snapshot.level + 1));
      return;
    }
    this.resetPauseState();
    this.simulation.nextLevel();
    this.audio.play('start');
  }

  quitToMenu(): void {
    this.resetPauseState();
    this.simulation.quitToMenu();
  }

  forceGameOver(): void {
    this.resetPauseState();
    this.simulation.forceGameOver();
  }

  move(direction: Direction): void {
    this.simulation.setDirection(direction);
  }

  tick(): void {
    this.simulation.step();
  }

  togglePlayerPause(): void {
    const snapshot = this.simulation.getSnapshot();
    if (snapshot.phase !== 'playing' && snapshot.phase !== 'paused') return;
    this.playerPauseActive = !this.playerPauseActive;
    this.reconcilePauseState();
  }

  setSystemPaused(paused: boolean): void {
    if (this.systemPauseActive === paused) return;
    this.systemPauseActive = paused;
    this.reconcilePauseState();
  }

  togglePlayerMuted(): void {
    this.setPlayerMuted(!this.audio.isPlayerMuted);
  }

  setPlayerMuted(muted: boolean): void {
    if (this.audio.isPlayerMuted === muted) return;
    this.audio.setPlayerMuted(muted);
    this.profile = { ...this.profile, playerMuted: muted };
    this.persistProfile();
    this.emitAudioState();
  }

  setSystemMuted(muted: boolean): void {
    if (this.systemMuted === muted) return;
    this.systemMuted = muted;
    this.audio.setSystemMuted(muted);
    this.emitAudioState();
  }

  dispose(): void {
    this.audio.dispose();
    this.events.clear();
  }

  private handleSnapshot = (snapshot: GameSnapshot): void => {
    const previous = this.previousSnapshot;
    const now = Date.now();

    if (beginsRun(previous, snapshot)) {
      this.runStartedAt = now;
      this.profile = { ...this.profile, totalRuns: this.profile.totalRuns + 1 };
      this.persistProfile();
      this.events.emit('runStarted', {
        level: snapshot.level,
        runNumber: this.profile.totalRuns,
        occurredAt: now
      });
    }

    if (snapshot.score !== previous.score) {
      const delta = snapshot.score - previous.score;
      if (delta > 0) this.audio.play('fruit');
      if (snapshot.score > this.profile.bestScore) {
        this.profile = { ...this.profile, bestScore: snapshot.score };
        this.persistProfile();
      }
      this.events.emit('scoreChanged', { level: snapshot.level, score: snapshot.score, delta });
    }

    if (snapshot.progress !== previous.progress || snapshot.level !== previous.level) {
      this.events.emit('progressChanged', {
        level: snapshot.level,
        progress: snapshot.progress,
        collected: snapshot.fruitEaten,
        target: snapshot.target
      });
    }

    const endReason = terminalReason(snapshot);
    const previousWasActive = previous.phase === 'playing' || previous.phase === 'paused';
    if (endReason && previousWasActive && this.runStartedAt !== null) {
      this.events.emit('runEnded', {
        level: previous.level,
        score: snapshot.score,
        progress: endReason === 'complete' ? 1 : previous.progress,
        reason: endReason,
        durationMs: Math.max(0, now - this.runStartedAt),
        occurredAt: now
      });
      this.runStartedAt = null;

      if (endReason === 'complete') {
        const highestUnlockedLevel = Math.min(LEVELS.length, snapshot.level + 1);
        if (highestUnlockedLevel > this.profile.highestUnlockedLevel) {
          this.profile = { ...this.profile, highestUnlockedLevel };
          this.persistProfile();
        }
        this.audio.play(snapshot.phase === 'finished' ? 'finished' : 'level-complete');
      } else if (endReason === 'fail') {
        this.audio.play('game-over');
      }
    }

    const pauseChanged = snapshot.phase === 'paused' !== (previous.phase === 'paused');
    const pauseSourceChanged = snapshot.pauseSource !== previous.pauseSource;
    if (pauseChanged || pauseSourceChanged) {
      this.events.emit('pauseChanged', {
        paused: snapshot.phase === 'paused',
        source: snapshot.pauseSource
      });
    }

    if (snapshot.phase === 'finished' && previous.phase !== 'finished') {
      this.events.emit('gameFinished', { score: snapshot.score, bestScore: this.profile.bestScore });
    }

    this.previousSnapshot = snapshot;
    this.events.emit('stateChanged', snapshot);
  };

  private reconcilePauseState(): void {
    const pauseSource: Exclude<PauseSource, null> | null = this.systemPauseActive
      ? 'system'
      : this.playerPauseActive
        ? 'player'
        : null;

    if (pauseSource) this.simulation.pause(pauseSource);
    else this.simulation.resume();
  }

  private resetPauseState(): void {
    this.playerPauseActive = false;
    this.systemPauseActive = false;
  }

  private persistProfile(): void {
    this.storage.saveProfile(this.profile);
  }

  private emitAudioState(): void {
    this.events.emit('audioChanged', this.getAudioState());
  }
}
