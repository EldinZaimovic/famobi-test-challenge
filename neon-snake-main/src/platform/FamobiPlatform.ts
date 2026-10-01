import type { GameController } from '../application/GameController';
import type { GameSnapshot } from '../game/types';
import type { GamePlatform } from './GamePlatform';
import type { EndReason, FamobiSdk } from './FamobiSdk';

export class FamobiPlatform implements GamePlatform {
  constructor(private readonly sdk: FamobiSdk) {}

  static async initialize(sdk: FamobiSdk, loadGame: () => Promise<{ startGame(): void }>): Promise<void> {
    let gameModule: ReturnType<typeof loadGame> | undefined;
    await sdk.init([
      () => {
        sdk.sendPreloadProgress(0);
        gameModule = loadGame();
        // Some SDK versions do not await callbacks. Handle early rejection while
        // waiting for init; awaiting gameModule below still propagates the error.
        void gameModule.catch(() => {});
      }
    ]);
    if (!gameModule) throw new Error('Famobi did not load the game module.');
    const game = await gameModule;
    sdk.sendPreloadProgress(90);
    game.startGame();
  }

  ready(): void {
    // Graphics and audio are procedural: no image/audio files remain to preload.
    this.sdk.sendPreloadProgress(100);
    this.sdk.gameReady();
  }

  async start(level: number): Promise<void> {
    await this.sdk.showInterstitialAd('button:game:start', 'start');
    await this.sdk.gameStart(level);
  }

  async end(
    reason: EndReason,
    snapshot: GameSnapshot,
    durationMs: number,
    levelScore: number
  ): Promise<void> {
    this.sdk.sendScore(levelScore, { type: 'level', level: snapshot.level });
    this.sdk.sendScore(snapshot.score, { type: 'total' });
    await this.sdk.gameEnd(reason, {
      metrics: {
        score: snapshot.score,
        fruit: snapshot.fruitEaten,
        durationMs,
        failureReason: snapshot.failureReason
      }
    });
    if (snapshot.phase === 'finished') await this.sdk.gameFinished({ metrics: { score: snapshot.score } });
  }

  async pause(): Promise<void> {
    await this.sdk.gamePause();
    await this.sdk.showInterstitialAd('button:game:pause', 'pause');
  }

  async resume(): Promise<void> {
    await this.sdk.showInterstitialAd('button:game:resume', 'resume');
    await this.sdk.gameResume();
  }

  score(score: number, level: number): void {
    this.sdk.sendScore(score, { type: 'live', level });
  }

  progress(progress: number): void {
    // Per-level completion, in percent. Each level/retry explicitly resets to 0.
    this.sdk.sendProgress(Math.round(progress * 100));
  }

  muted(muted: boolean): void {
    this.sdk.gameMuted(muted);
  }

  connect(controller: GameController): () => void {
    let externalPaused = this.sdk.isPaused();
    let externalMuted = this.sdk.isMuted();
    const sync = (): void => {
      const hidden = this.sdk.hasFeature('visibilitychange') && document.hidden;
      controller.setSystemPaused(externalPaused || hidden);
      controller.setSystemMuted(externalMuted || hidden);
    };
    this.sdk.onPauseStateChange((paused) => {
      externalPaused = paused;
      sync();
    });
    this.sdk.onMuteStateChange((muted) => {
      externalMuted = muted;
      sync();
    });
    const refresh = (): void => {
      externalPaused = this.sdk.isPaused();
      externalMuted = this.sdk.isMuted();
      sync();
    };
    document.addEventListener('visibilitychange', refresh);
    this.sdk.onGoToHome(() => {
      void controller.quitToMenu();
    });
    this.sdk.onQuitGame(() => {
      void controller.quitToMenu();
    });
    this.sdk.onRestartGame(() => {
      void controller.restartLevel();
    });
    this.sdk.onGoToNextLevel(() => {
      void controller.goToNextLevel();
    });
    this.sdk.onGoToLevel((level) => {
      void controller.goToLevel(level);
    });
    this.sdk.onGameOver(() => {
      void controller.forceGameOver();
    });
    sync();
    return () => document.removeEventListener('visibilitychange', refresh);
  }
}
