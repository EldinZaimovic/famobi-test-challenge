// The subset of https://docs.famobi.com/api used by this game.
export type EventParams = { metrics?: Record<string, number | string | boolean | null> };
export type EndReason = 'complete' | 'fail' | 'quit';

export interface FamobiSdk {
  init(load: (string | (() => void))[]): Promise<void>;
  sendPreloadProgress(progress: number): void;
  gameReady(): void;
  gameStart(level?: number, params?: EventParams): Promise<void>;
  gameEnd(reason: EndReason, params?: EventParams): Promise<void>;
  gameFinished(params?: EventParams): Promise<void>;
  gamePause(): Promise<void>;
  gameResume(): Promise<void>;
  sendScore(score: number, params?: { type?: 'live' | 'level' | 'total'; level?: number }): void;
  sendProgress(progress: number): void;
  gameMuted(muted: boolean): void;
  isMuted(): boolean;
  isPaused(): boolean;
  onMuteStateChange(callback: (muted: boolean) => void): void;
  onPauseStateChange(callback: (paused: boolean) => void): void;
  onGoToHome(callback: () => void): void;
  onQuitGame(callback: () => void): void;
  onRestartGame(callback: () => void): void;
  onGoToNextLevel(callback: () => void): void;
  onGoToLevel(callback: (level: number) => void): void;
  onGameOver(callback: () => void): void;
  hasFeature(feature: string): boolean;
  showInterstitialAd(
    eventId: string,
    placement?: 'start' | 'next' | 'pause' | 'resume' | 'quit' | 'browse'
  ): Promise<void>;
  storage: {
    getItem(key: string): unknown;
    setItem(key: string, value: unknown): void;
  };
}

declare global {
  interface Window {
    GameInterface: FamobiSdk;
  }
}
