import type { FamobiSdk } from './FamobiSdk';

/** Explicit offline development adapter, never used in the Famobi build. */
export function createLocalSdk(): FamobiSdk {
  const noop = () => {};
  const done = async () => {};
  return {
    init: async callbacks => { for (const callback of callbacks) if (typeof callback === 'function') callback(); },
    sendPreloadProgress: noop, gameReady: noop, gameStart: done, gameEnd: done,
    gameFinished: done, gamePause: done, gameResume: done, sendScore: noop,
    sendProgress: noop, gameMuted: noop, isMuted: () => false, isPaused: () => false,
    onMuteStateChange: noop, onPauseStateChange: noop, onGoToHome: noop,
    onQuitGame: noop, onRestartGame: noop, onGoToNextLevel: noop,
    onGoToLevel: noop, onGameOver: noop, hasFeature: () => true,
    showInterstitialAd: done,
    storage: {
      getItem: key => localStorage.getItem(`local-game:${key}`),
      setItem: (key, value) => localStorage.setItem(`local-game:${key}`, String(value))
    }
  };
}
