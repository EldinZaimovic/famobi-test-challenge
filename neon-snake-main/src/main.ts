import Phaser from 'phaser';
import { GameRenderer } from './game/GameRenderer';
import { FamobiPlatform } from './platform/FamobiPlatform';
import { FamobiAnalyticsStorage } from './platform/FamobiAnalyticsStorage';
import { HttpAnalyticsSink } from './platform/HttpAnalyticsSink';
import { GameplayAnalytics } from './core/analytics/GameplayAnalytics';

import { GameController } from './application/GameController';
import { FamobiGameStorage } from './core/storage/GameStorage';
import { SnakeScene } from './game/scenes/SnakeScene';
import { SnakeGame } from './game/snakeGame';
import type { Direction, GamePhase, GameSnapshot } from './game/types';

export function startGame(): void {
  const requiredElement = <T extends HTMLElement>(selector: string): T => {
    const element = document.querySelector<T>(selector);
    if (!element) throw new Error(`Missing required element: ${selector}`);
    return element;
  };

  const shell = requiredElement<HTMLElement>('.game-shell');
  const levelValue = requiredElement<HTMLElement>('#level-value');
  const scoreValue = requiredElement<HTMLElement>('#score-value');
  const bestValue = requiredElement<HTMLElement>('#best-value');
  const fruitValue = requiredElement<HTMLElement>('#fruit-value');
  const progressValue = requiredElement<HTMLElement>('#progress-value');
  const overlay = requiredElement<HTMLElement>('#game-overlay');
  const overlayEyebrow = requiredElement<HTMLElement>('#overlay-eyebrow');
  const overlayTitle = requiredElement<HTMLElement>('#overlay-title');
  const overlayCopy = requiredElement<HTMLElement>('#overlay-copy');
  const primaryAction = requiredElement<HTMLButtonElement>('#primary-action');
  const secondaryAction = requiredElement<HTMLButtonElement>('#secondary-action');
  const pauseButton = requiredElement<HTMLButtonElement>('#pause-button');
  const muteButton = requiredElement<HTMLButtonElement>('#mute-button');
  const levelSelect = requiredElement<HTMLElement>('#level-select');

  const simulation = new SnakeGame();
  const sdk = window.GameInterface;
  const platform = new FamobiPlatform(sdk);
  const journal = new FamobiAnalyticsStorage(sdk.storage);
  const transport = new HttpAnalyticsSink({
    getItem: (key) => localStorage.getItem(key),
    setItem: (key, value) => localStorage.setItem(key, value)
  });
  void transport.flush();
  window.addEventListener('online', () => {
    void transport.flush();
  });
  const controller = new GameController(
    simulation,
    new FamobiGameStorage(sdk.storage),
    platform,
    sdk.hasFeature('pause'),
    new GameplayAnalytics({
      record(event) {
        try {
          journal.record(event);
        } finally {
          transport.record(event);
        }
      }
    })
  );
  const disconnectPlatform = platform.connect(controller);
  const snakeScene = new SnakeScene(controller);
  let currentSnapshot = controller.getSnapshot();

  const phaserGame = new GameRenderer({
    type: Phaser.AUTO,
    parent: 'game-container',
    width: 600,
    height: 600,
    backgroundColor: '#10182c',
    scene: [snakeScene],
    audio: { noAudio: true },
    render: {
      antialias: true,
      pixelArt: false
    },
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH
    }
  });

  const failureCopy: Record<NonNullable<GameSnapshot['failureReason']>, string> = {
    wall: 'You ran into the edge of the grid.',
    snake: 'You crossed your own trail.',
    obstacle: 'That barrier was tougher than it looked.',
    external: 'The run was ended by an external game command.'
  };

  const overlayContent: Record<
    Exclude<GamePhase, 'playing'>,
    (snapshot: GameSnapshot) => {
      eyebrow: string;
      title: string;
      copy: string;
      primary?: string;
      secondary?: string;
    }
  > = {
    menu: () => ({
      eyebrow: 'Three levels',
      title: 'Ready to slither?',
      copy: 'Eat the fruit, avoid the walls, and clear every level.',
      primary: 'Start game'
    }),
    paused: () => ({
      eyebrow: 'Game paused',
      title: 'Take a breather',
      copy: 'Your run is waiting exactly where you left it.',
      primary: 'Resume',
      secondary: 'Exit to menu'
    }),
    'level-complete': (snapshot) => ({
      eyebrow: `Level ${snapshot.level} clear`,
      title: 'Nice moves!',
      copy: `Score ${snapshot.score}. The next grid is faster and a little less friendly.`,
      primary: 'Next level',
      secondary: 'Exit to menu'
    }),
    'game-over': (snapshot) => ({
      eyebrow: `Level ${snapshot.level}`,
      title: 'Game over',
      copy: snapshot.failureReason ? failureCopy[snapshot.failureReason] : 'That run came to an end.',
      primary: 'Try again',
      secondary: 'Exit to menu'
    }),
    finished: (snapshot) => ({
      eyebrow: 'All levels clear',
      title: 'Snake master!',
      copy: `Final score: ${snapshot.score}. You conquered every grid.`,
      primary: 'Play again',
      secondary: 'Main menu'
    })
  };

  const renderInterface = (snapshot: GameSnapshot): void => {
    currentSnapshot = snapshot;
    const blocked =
      !controller.isReady() ||
      controller.isBusy() ||
      controller.isSystemPaused() ||
      Boolean(controller.getTransitionError());
    shell.inert = blocked && !controller.canAdvance();
    primaryAction.disabled = blocked;
    secondaryAction.disabled = blocked;

    levelValue.textContent = String(snapshot.level);
    scoreValue.textContent = String(snapshot.score);
    bestValue.textContent = String(controller.getProfile().bestScore);
    fruitValue.textContent = `${snapshot.fruitEaten} / ${snapshot.target}`;
    progressValue.style.transform = `scaleX(${Math.min(1, snapshot.progress)})`;

    const canPause = snapshot.phase === 'playing' || snapshot.phase === 'paused';
    pauseButton.disabled = !canPause || blocked;
    pauseButton.setAttribute('aria-label', snapshot.phase === 'paused' ? 'Resume game' : 'Pause game');
    pauseButton.firstElementChild!.textContent = snapshot.phase === 'paused' ? '▶' : 'Ⅱ';
    levelSelect.hidden = snapshot.phase !== 'menu';
    levelSelect.querySelectorAll<HTMLButtonElement>('[data-level]').forEach((button) => {
      const level = Number(button.dataset.level);
      button.disabled = blocked || level > controller.getProfile().highestUnlockedLevel;
    });

    const error = controller.getTransitionError();
    if (error) {
      shell.inert = false;
      overlay.hidden = false;
      overlayEyebrow.textContent = 'Connection interrupted';
      overlayTitle.textContent = 'Please reload';
      overlayCopy.textContent = error;
      primaryAction.hidden = false;
      primaryAction.disabled = false;
      primaryAction.textContent = 'Reload';
      secondaryAction.hidden = true;
      return;
    }

    if (controller.isSystemPaused()) {
      overlay.hidden = false;
      overlayEyebrow.textContent = 'Game paused';
      overlayTitle.textContent = 'Please wait';
      overlayCopy.textContent = 'Gameplay will continue when the interruption has ended.';
      primaryAction.hidden = true;
      secondaryAction.hidden = true;
      return;
    }

    if (snapshot.phase === 'playing' || controller.isBusy()) {
      overlay.hidden = true;
      return;
    }

    overlay.hidden = false;
    const content = overlayContent[snapshot.phase](snapshot);
    overlayEyebrow.textContent = content.eyebrow;
    overlayTitle.textContent = content.title;
    overlayCopy.textContent = content.copy;
    primaryAction.textContent = content.primary ?? '';
    primaryAction.hidden = !content.primary;
    secondaryAction.textContent = content.secondary ?? '';
    secondaryAction.hidden = !content.secondary;
  };

  const performPrimaryAction = (): void => {
    if (controller.getTransitionError()) {
      location.reload();
      return;
    }
    switch (currentSnapshot.phase) {
      case 'menu':
      case 'finished':
        controller.startNewGame();
        break;
      case 'paused':
        if (currentSnapshot.pauseSource === 'player') controller.togglePlayerPause();
        break;
      case 'level-complete':
        controller.goToNextLevel();
        break;
      case 'game-over':
        controller.restartLevel();
        break;
      case 'playing':
        break;
    }
  };

  const togglePause = (): void => {
    void controller.togglePlayerPause();
  };

  const renderAudioState = (): void => {
    const audioState = controller.getAudioState();
    muteButton.setAttribute('aria-label', audioState.playerMuted ? 'Unmute audio' : 'Mute audio');
    muteButton.firstElementChild!.textContent = audioState.effectiveMuted ? '×' : '♪';
  };

  pauseButton.hidden = !sdk.hasFeature('pause');
  muteButton.hidden = !sdk.hasFeature('audio');
  requiredElement<HTMLElement>('.hud-progress').hidden = !sdk.hasFeature('progress');
  scoreValue.parentElement!.hidden = !sdk.hasFeature('score');
  bestValue.parentElement!.hidden = !sdk.hasFeature('score');
  document.querySelector('.brand')!.addEventListener('click', (event) => {
    event.preventDefault();
    void controller.quitToMenu();
  });
  controller.subscribe(renderInterface);
  controller.events.on('audioChanged', renderAudioState);
  renderAudioState();

  primaryAction.addEventListener('click', performPrimaryAction);
  secondaryAction.addEventListener('click', () => controller.quitToMenu());
  pauseButton.addEventListener('click', togglePause);
  muteButton.addEventListener('click', () => controller.togglePlayerMuted());

  document.querySelectorAll<HTMLButtonElement>('[data-direction]').forEach((button) => {
    button.addEventListener('click', () => {
      controller.move(button.dataset.direction as Direction);
      phaserGame.canvas.focus({ preventScroll: true });
    });
  });

  levelSelect.querySelectorAll<HTMLButtonElement>('[data-level]').forEach((button) => {
    button.addEventListener('click', () => controller.startAtLevel(Number(button.dataset.level)));
  });

  window.addEventListener('pagehide', (event) => {
    // A cached page resumes the same attempt when the player navigates back.
    if (event.persisted) return;
    disconnectPlatform();
    controller.dispose('page_exit');
    transport.flushOnDeparture();
    transport.dispose();
    phaserGame.destroy(true);
  });
}
