import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GameController } from '../src/application/GameController.ts';
import { SnakeGame } from '../src/game/snakeGame.ts';
import { FamobiPlatform } from '../src/platform/FamobiPlatform.ts';
import { FamobiGameStorage } from '../src/core/storage/GameStorage.ts';
import { GameAudio } from '../src/core/audio/GameAudio.ts';
import { GameplayAnalytics } from '../src/core/analytics/GameplayAnalytics.ts';
import { FamobiAnalyticsStorage, ANALYTICS_STORAGE_KEY, ANALYTICS_EVENT_LIMIT } from '../src/platform/FamobiAnalyticsStorage.ts';

global.window = {};
const settle = () => new Promise((resolve) => setImmediate(resolve));
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
};

function fixture({ playerPauseEnabled = true, analyticsSink, analyticsRuntime } = {}) {
  const calls = [];
  const callbacks = {};
  const saved = new Map();
  const sdk = {
    storage: { getItem: (key) => saved.get(key), setItem: (key, value) => saved.set(key, value) },
    isPaused: () => false,
    isMuted: () => false,
    hasFeature: () => true
  };
  for (const name of ['sendPreloadProgress', 'gameReady', 'sendScore', 'sendProgress', 'gameMuted'])
    sdk[name] = (...args) => calls.push([name, ...args]);
  for (const name of [
    'gameStart',
    'gameEnd',
    'gameFinished',
    'gamePause',
    'gameResume',
    'showInterstitialAd'
  ])
    sdk[name] = async (...args) => {
      calls.push([name, ...args]);
    };
  for (const name of [
    'onPauseStateChange',
    'onMuteStateChange',
    'onGoToHome',
    'onQuitGame',
    'onRestartGame',
    'onGoToNextLevel',
    'onGoToLevel',
    'onGameOver'
  ])
    sdk[name] = (fn) => {
      callbacks[name] = fn;
    };
  const simulation = new SnakeGame();
  const platform = new FamobiPlatform(sdk);
  const analytics = new GameplayAnalytics(analyticsSink ?? new FamobiAnalyticsStorage(sdk.storage), analyticsRuntime);
  const controller = new GameController(
    simulation,
    new FamobiGameStorage(sdk.storage),
    platform,
    playerPauseEnabled,
    analytics
  );
  controller.markReady();
  const recorded = () => JSON.parse(saved.get(ANALYTICS_STORAGE_KEY) ?? '[]');
  return { sdk, calls, callbacks, saved, simulation, platform, controller, recorded };
}
const events = (f, name) => f.calls.filter((call) => call[0] === name);

test('loading reaches 100 before exactly one ready event', () => {
  const f = fixture();
  f.controller.markReady();
  assert.deepEqual(f.calls, [['sendPreloadProgress', 100], ['gameReady']]);
});

test('delayed start blocks movement and duplicate starts until SDK resolves', async () => {
  const f = fixture(),
    gate = deferred();
  f.sdk.gameStart = async (level) => {
    f.calls.push(['gameStart', level]);
    await gate.promise;
  };
  const starting = f.controller.startNewGame();
  await settle();
  await f.controller.startNewGame();
  f.controller.tick();
  assert.equal(f.controller.getSnapshot().phase, 'menu');
  assert.equal(events(f, 'gameStart').length, 1);
  assert.deepEqual(f.recorded(), []);
  gate.resolve();
  await starting;
  assert.equal(f.controller.getSnapshot().phase, 'playing');
  assert.deepEqual(events(f, 'sendScore'), [['sendScore', 0, { type: 'live', level: 1 }]]);
  assert.deepEqual(events(f, 'sendProgress'), [['sendProgress', 0]]);
  assert.equal(f.recorded().filter((e) => e.name === 'gameplay_started').length, 1);
});

test('wall failure freezes the board and delays result/retry until end resolves', async () => {
  const f = fixture(),
    gate = deferred();
  await f.controller.startNewGame();
  f.sdk.gameEnd = async (...args) => {
    f.calls.push(['gameEnd', ...args]);
    await gate.promise;
  };
  for (let i = 0; i < 10; i++) f.controller.tick();
  await settle();
  assert.equal(f.controller.getSnapshot().phase, 'game-over');
  assert.equal(f.controller.canAdvance(), false);
  const frozen = f.controller.getSnapshot();
  f.controller.tick();
  assert.deepEqual(f.controller.getSnapshot(), frozen);
  assert.equal(f.controller.isBusy(), true);
  await f.controller.restartLevel();
  assert.equal(events(f, 'gameStart').length, 1);
  assert.equal(events(f, 'gameEnd')[0][1], 'fail');
  gate.resolve();
  await settle();
  assert.equal(f.controller.getSnapshot().phase, 'game-over');
  await f.controller.restartLevel();
  assert.equal(events(f, 'gameStart').length, 2);
  assert.equal(events(f, 'gameEnd').length, 1);
});

test('quit waits for acknowledgment and returning home from results sends no duplicate end', async () => {
  const f = fixture(),
    gate = deferred();
  await f.controller.startNewGame();
  f.sdk.gameEnd = async (...args) => {
    f.calls.push(['gameEnd', ...args]);
    await gate.promise;
  };
  const quitting = f.controller.quitToMenu();
  await settle();
  assert.equal(f.controller.getSnapshot().phase, 'playing');
  gate.resolve();
  await quitting;
  assert.equal(f.controller.getSnapshot().phase, 'menu');
  await f.controller.quitToMenu();
  assert.deepEqual(
    events(f, 'gameEnd').map((e) => e[1]),
    ['quit']
  );
});

test('restart during a run ends it before starting the next attempt', async () => {
  const f = fixture();
  await f.controller.startNewGame();
  await f.controller.restartLevel();
  assert.deepEqual(
    f.calls.filter((c) => ['gameStart', 'gameEnd'].includes(c[0])).map((c) => c.slice(0, 2)),
    [
      ['gameStart', 1],
      ['gameEnd', 'quit'],
      ['gameStart', 1]
    ]
  );
});

test('player pause and resume wait for the SDK; external pause cannot clear player pause', async () => {
  const f = fixture();
  await f.controller.startNewGame();
  const pauseGate = deferred();
  f.sdk.gamePause = () => pauseGate.promise;
  const pausing = f.controller.togglePlayerPause();
  assert.equal(f.controller.getSnapshot().phase, 'playing');
  const before = f.controller.getSnapshot().snake[0];
  f.controller.move('up');
  f.controller.tick();
  assert.deepEqual(f.controller.getSnapshot().snake[0], { x: before.x, y: before.y - 1 });
  pauseGate.resolve();
  await pausing;
  assert.equal(f.controller.getSnapshot().pauseSource, 'player');
  f.controller.setSystemPaused(true);
  await f.controller.togglePlayerPause();
  f.controller.setSystemPaused(false);
  assert.equal(f.controller.getSnapshot().pauseSource, 'player');
  const resumeGate = deferred();
  f.sdk.gameResume = () => resumeGate.promise;
  const resuming = f.controller.togglePlayerPause();
  await settle();
  assert.equal(f.controller.getSnapshot().phase, 'paused');
  resumeGate.resolve();
  await resuming;
  assert.equal(f.controller.getSnapshot().phase, 'playing');
});

test('external pause during start survives start resolution; ticks/input remain frozen', async () => {
  const f = fixture(),
    gate = deferred();
  f.sdk.gameStart = () => gate.promise;
  const starting = f.controller.startNewGame();
  await settle();
  f.controller.setSystemPaused(true);
  gate.resolve();
  await starting;
  const before = f.controller.getSnapshot();
  assert.equal(before.pauseSource, 'system');
  f.controller.move('up');
  f.controller.tick();
  assert.deepEqual(f.controller.getSnapshot(), before);
  f.controller.setSystemPaused(false);
  assert.equal(f.controller.getSnapshot().phase, 'playing');
  assert.equal(events(f, 'gamePause').length, 0);
  assert.equal(events(f, 'gameResume').length, 0);
});

test('initial SDK pause/mute and hidden tab compose without overriding either', async () => {
  const f = fixture();
  const listeners = new Map();
  global.document = {
    hidden: false,
    addEventListener: (name, fn) => listeners.set(name, fn),
    removeEventListener: (name) => listeners.delete(name)
  };
  f.sdk.isPaused = () => true;
  f.sdk.isMuted = () => true;
  const disconnect = f.platform.connect(f.controller);
  assert.equal(f.controller.isSystemPaused(), true);
  assert.equal(f.controller.getAudioState().effectiveMuted, true);
  await f.controller.startNewGame();
  assert.equal(events(f, 'gameStart').length, 0);
  document.hidden = true;
  listeners.get('visibilitychange')();
  document.hidden = false;
  listeners.get('visibilitychange')();
  assert.equal(f.controller.isSystemPaused(), true);
  f.sdk.isPaused = () => false;
  f.sdk.isMuted = () => false;
  f.callbacks.onPauseStateChange(false);
  f.callbacks.onMuteStateChange(false);
  await f.controller.startNewGame();
  f.controller.setPlayerMuted(true);
  f.callbacks.onMuteStateChange(true);
  f.callbacks.onMuteStateChange(false);
  assert.equal(f.controller.getAudioState().effectiveMuted, true);
  document.hidden = true;
  f.sdk.hasFeature = () => false;
  listeners.get('visibilitychange')();
  assert.equal(f.controller.isSystemPaused(), false);
  disconnect();
  assert.equal(listeners.size, 0);
});

function pathToFruit(s) {
  const queue = [{ ...s.snake[0], path: [] }],
    seen = new Set();
  const blocked = new Set([...s.snake.slice(0, -1), ...s.obstacles].map((p) => `${p.x},${p.y}`));
  const opposite = { up: 'down', down: 'up', left: 'right', right: 'left' };
  for (let i = 0; i < queue.length; i++) {
    const p = queue[i];
    if (p.x === s.food.x && p.y === s.food.y) return p.path;
    for (const [direction, dx, dy] of [
      ['up', 0, -1],
      ['right', 1, 0],
      ['down', 0, 1],
      ['left', -1, 0]
    ]) {
      if (!p.path.length && opposite[s.direction] === direction) continue;
      const x = p.x + dx,
        y = p.y + dy,
        key = `${x},${y}`;
      if (x < 0 || x >= 20 || y < 0 || y >= 20 || blocked.has(key) || seen.has(key)) continue;
      seen.add(key);
      queue.push({ x, y, path: [...p.path, direction] });
    }
  }
  throw new Error('No safe route to fruit');
}

test('plays all three real levels: live/level/total scores, progress, unlocks and final completion ordering', async () => {
  const originalRandom = Math.random;
  Math.random = () => 0;
  try {
    const f = fixture();
    await f.controller.startNewGame();
    for (let level = 1; level <= 3; level++) {
      for (let steps = 0; f.controller.getSnapshot().phase === 'playing' && steps < 1000; steps++) {
        const s = f.controller.getSnapshot();
        f.controller.move(pathToFruit(s)[0]);
        f.controller.tick();
        await settle();
      }
      assert.equal(f.controller.getSnapshot().phase, level === 3 ? 'finished' : 'level-complete');
      assert.equal(f.controller.getSnapshot().progress, 1);
      if (level < 3) await f.controller.goToNextLevel();
    }
    assert.equal(f.controller.getSnapshot().score, 460);
    assert.equal(f.controller.getProfile().highestUnlockedLevel, 3);
    assert.deepEqual(
      events(f, 'gameStart').map((e) => e[1]),
      [1, 2, 3]
    );
    assert.deepEqual(
      events(f, 'gameEnd').map((e) => e[1]),
      ['complete', 'complete', 'complete']
    );
    assert.deepEqual(
      events(f, 'sendScore')
        .filter((e) => e[2].type === 'level')
        .map((e) => e[1]),
      [50, 140, 270]
    );
    assert.deepEqual(
      events(f, 'sendScore')
        .filter((e) => e[2].type === 'total')
        .map((e) => e[1]),
      [50, 190, 460]
    );
    assert.equal(events(f, 'sendProgress').filter((e) => e[1] === 0).length, 3);
    assert.equal(events(f, 'sendProgress').filter((e) => e[1] === 100).length, 3);
    assert.equal(events(f, 'gameFinished').length, 1);
    assert.ok(
      f.calls.findIndex((e) => e[0] === 'gameFinished') > f.calls.findLastIndex((e) => e[0] === 'gameEnd')
    );
    await f.controller.quitToMenu();
    assert.equal(events(f, 'gameEnd').length, 3);
    const restored = new FamobiGameStorage(f.sdk.storage).loadProfile();
    assert.equal(restored.bestScore, 460);
    assert.equal(restored.highestUnlockedLevel, 3);
    const records = f.recorded();
    const starts = records.filter((e) => e.name === 'gameplay_started');
    const ends = records.filter((e) => e.name === 'gameplay_ended');
    assert.equal(new Set(starts.map((e) => e.attemptId)).size, 3);
    assert.deepEqual(ends.map((e) => e.attemptId), starts.map((e) => e.attemptId));
    assert.deepEqual(ends.map((e) => e.level), [1, 2, 3]);
    assert.deepEqual(ends.map((e) => e.outcome), ['completed', 'completed', 'completed']);
    assert.deepEqual(ends.map((e) => e.levelScore), [50, 140, 270]);
    assert.deepEqual(ends.map((e) => e.score), [50, 190, 460]);
    assert.deepEqual(ends.map((e) => e.progress), [1, 1, 1]);
    assert.deepEqual(starts.map((e) => e.progress), [0, 0, 0]);
    assert.deepEqual(starts.map((e) => e.levelScore), [0, 0, 0]);
    // One progress record per fruit, never per animation tick.
    assert.equal(records.filter((e) => e.name === 'gameplay_progress').length, 21);
    assert.equal(new Set(records.map((e) => e.eventId)).size, records.length);
  } finally {
    Math.random = originalRandom;
  }
});

test('rejected SDK start fails closed, leaves menu and does not create a run', async () => {
  const f = fixture();
  f.sdk.gameStart = async () => {
    throw new Error('Test rejection');
  };
  const previous = console.error;
  console.error = () => {};
  try {
    await f.controller.startNewGame();
  } finally {
    console.error = previous;
  }
  assert.equal(f.controller.getSnapshot().phase, 'menu');
  assert.match(f.controller.getTransitionError(), /Reload/);
  assert.equal(f.controller.getProfile().totalRuns, 0);
  assert.deepEqual(f.recorded(), []);
});

test('storage recovers from missing/malformed data and validates profile values', () => {
  const f = fixture();
  f.saved.set('neon-snake:profile', '{broken');
  assert.equal(new FamobiGameStorage(f.sdk.storage).loadProfile().bestScore, 0);
  f.saved.set(
    'neon-snake:profile',
    JSON.stringify({ bestScore: -10, highestUnlockedLevel: 99, playerMuted: 'yes' })
  );
  assert.deepEqual(new FamobiGameStorage(f.sdk.storage).loadProfile(), {
    bestScore: 0,
    highestUnlockedLevel: 3,
    totalRuns: 0,
    playerMuted: false
  });
});

test('external mute immediately stops already scheduled sound effects', () => {
  const oscillators = [];
  window.AudioContext = class {
    currentTime = 0;
    destination = {};
    resume() {
      return Promise.resolve();
    }
    close() {
      return Promise.resolve();
    }
    createOscillator() {
      const oscillator = {
        frequency: { setValueAtTime() {} },
        connect() {},
        start() {},
        stop() {
          this.stops = (this.stops || 0) + 1;
        }
      };
      oscillators.push(oscillator);
      return oscillator;
    }
    createGain() {
      return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} };
    }
  };
  const audio = new GameAudio(false);
  audio.play('start');
  audio.setSystemMuted(true);
  assert.equal(oscillators.length, 2);
  assert.ok(oscillators.every((o) => o.stops === 2));
  audio.play('fruit');
  assert.equal(oscillators.length, 2);
  audio.dispose();
  delete window.AudioContext;
});

test('a collision during delayed pause ends exactly once after acknowledgment', async () => {
  const f = fixture();
  await f.controller.startNewGame();
  const gate = deferred();
  f.sdk.gamePause = async () => {
    f.calls.push(['gamePause']);
    await gate.promise;
  };
  const pausing = f.controller.togglePlayerPause();
  for (let i = 0; i < 10; i++) f.controller.tick();
  assert.equal(f.controller.getSnapshot().phase, 'game-over');
  assert.equal(events(f, 'gameEnd').length, 0);
  gate.resolve();
  await pausing;
  assert.equal(events(f, 'gameEnd').length, 1);
  assert.equal(events(f, 'gameEnd')[0][1], 'fail');
  assert.equal(f.controller.isBusy(), false);
  await f.controller.restartLevel();
  assert.equal(f.controller.getSnapshot().phase, 'playing');
});

test('external pause during a pending resume still blocks movement after acknowledgment', async () => {
  const f = fixture();
  await f.controller.startNewGame();
  await f.controller.togglePlayerPause();
  const gate = deferred();
  f.sdk.gameResume = () => gate.promise;
  const resuming = f.controller.togglePlayerPause();
  await settle();
  f.controller.setSystemPaused(true);
  gate.resolve();
  await resuming;
  assert.equal(f.controller.getSnapshot().pauseSource, 'system');
  const frozen = f.controller.getSnapshot();
  f.controller.tick();
  assert.deepEqual(f.controller.getSnapshot(), frozen);
  f.controller.setSystemPaused(false);
  assert.equal(f.controller.canAdvance(), true);
});

for (const method of ['gamePause', 'gameResume', 'gameEnd']) {
  test(`rejected ${method} stops movement and blocks further transitions`, async () => {
    const f = fixture();
    await f.controller.startNewGame();
    if (method === 'gameResume') await f.controller.togglePlayerPause();
    f.sdk[method] = async () => {
      throw new Error(`Rejected ${method}`);
    };
    const originalError = console.error;
    console.error = () => {};
    try {
      if (method === 'gameEnd') await f.controller.forceGameOver();
      else await f.controller.togglePlayerPause();
    } finally {
      console.error = originalError;
    }
    assert.match(f.controller.getTransitionError(), /Reload/);
    assert.equal(f.controller.canAdvance(), false);
    const frozen = f.controller.getSnapshot();
    f.controller.tick();
    await f.controller.restartLevel();
    assert.deepEqual(f.controller.getSnapshot(), frozen);
    assert.equal(events(f, 'gameStart').length, 1);
  });
}

test('disabled player pause is enforced by the controller for every input source', async () => {
  const f = fixture({ playerPauseEnabled: false });
  await f.controller.startNewGame();
  await f.controller.togglePlayerPause();
  assert.equal(events(f, 'gamePause').length, 0);
  assert.equal(f.controller.canAdvance(), true);
  f.controller.setSystemPaused(true);
  assert.equal(f.controller.canAdvance(), false);
});

test('initialization holds game loading, and both init and module loading must finish before start', async () => {
  const f = fixture();
  const initGate = deferred();
  const moduleGate = deferred();
  let loadCallback;
  let loads = 0;
  let starts = 0;
  f.sdk.init = async ([callback]) => {
    loadCallback = callback;
    await initGate.promise;
  };
  const boot = FamobiPlatform.initialize(f.sdk, () => {
    loads++;
    return moduleGate.promise;
  });
  assert.equal(loads, 0);
  loadCallback();
  assert.equal(loads, 1);
  initGate.resolve();
  await settle();
  assert.equal(starts, 0);
  moduleGate.resolve({
    startGame: () => {
      starts++;
    }
  });
  await boot;
  assert.equal(starts, 1);

  // Also verify the reverse order: a cached module cannot bypass pending init.
  const secondGate = deferred();
  f.sdk.init = async ([callback]) => {
    callback();
    await secondGate.promise;
  };
  const secondBoot = FamobiPlatform.initialize(f.sdk, async () => ({
    startGame: () => {
      starts++;
    }
  }));
  await settle();
  assert.equal(starts, 1);
  secondGate.resolve();
  await secondBoot;
  assert.equal(starts, 2);
});

test('initialization and module errors propagate to the bootstrap error screen', async () => {
  const f = fixture();
  let loads = 0;
  f.sdk.init = async () => {
    throw new Error('SDK initialization failed');
  };
  await assert.rejects(
    FamobiPlatform.initialize(f.sdk, async () => {
      loads++;
      return { startGame() {} };
    }),
    /SDK initialization failed/
  );
  assert.equal(loads, 0);

  f.sdk.init = async ([callback]) => {
    callback();
    await settle();
  };
  await assert.rejects(
    FamobiPlatform.initialize(f.sdk, async () => {
      throw new Error('Game download failed');
    }),
    /Game download failed/
  );
});

test('analytics captures occurrence time before SDK acknowledgment and uses monotonic duration', async () => {
  let wallTime = 1_800_000_000_000;
  let elapsed = 100;
  const f = fixture({ analyticsRuntime: {
    now: () => wallTime, monotonicNow: () => elapsed, id: () => 'attempt-1'
  } });
  await f.controller.startNewGame();
  const gate = deferred();
  f.sdk.gameEnd = () => gate.promise;
  wallTime -= 5000; // Changing the system clock cannot produce a negative duration.
  elapsed += 2500;
  const ending = f.controller.forceGameOver();
  assert.deepEqual(f.recorded().map((e) => e.name), ['gameplay_started', 'gameplay_ended']);
  const end = f.recorded()[1];
  assert.equal(end.occurredAt, wallTime);
  assert.equal(end.durationMs, 2500);
  assert.equal(end.outcome, 'failed');
  assert.equal(end.failureReason, 'external');
  assert.equal(end.attemptId, f.recorded()[0].attemptId);
  assert.equal(end.schemaVersion, 1);
  wallTime += 10_000;
  elapsed += 10_000;
  f.controller.dispose('page_exit');
  gate.resolve();
  await ending;
  assert.deepEqual(f.recorded()[1], end);
  assert.equal(f.recorded().length, 2);
});

test('analytics distinguishes restarts, replacements and menu exits with fresh attempt IDs', async () => {
  const f = fixture();
  await f.controller.startNewGame();
  await f.controller.restartLevel();
  await f.controller.goToLevel(2);
  await f.controller.togglePlayerPause();
  await f.controller.quitToMenu();
  await f.controller.quitToMenu();
  f.controller.dispose();
  const records = f.recorded();
  assert.deepEqual(records.map((e) => e.name), [
    'gameplay_started', 'gameplay_ended', 'gameplay_started',
    'gameplay_ended', 'gameplay_started', 'gameplay_ended'
  ]);
  const starts = records.filter((e) => e.name === 'gameplay_started');
  const ends = records.filter((e) => e.name === 'gameplay_ended');
  assert.equal(new Set(starts.map((e) => e.attemptId)).size, 3);
  assert.deepEqual(ends.map((e) => e.attemptId), starts.map((e) => e.attemptId));
  assert.deepEqual(ends.map((e) => e.outcome), ['left', 'left', 'left']);
  assert.deepEqual(ends.map((e) => e.leaveReason), ['restart', 'replaced', 'menu']);
  assert.deepEqual(ends.map((e) => e.level), [1, 1, 2]);
});

test('page departure captures the latest score/progress once, including paused runs', async () => {
  const f = fixture();
  await f.controller.startNewGame();
  const route = pathToFruit(f.controller.getSnapshot());
  for (const direction of route) {
    f.controller.move(direction);
    f.controller.tick();
  }
  await f.controller.togglePlayerPause();
  f.controller.dispose('page_exit');
  f.controller.dispose('page_exit');
  await f.controller.restartLevel();
  const ends = f.recorded().filter((e) => e.name === 'gameplay_ended');
  assert.equal(ends.length, 1);
  assert.equal(ends[0].outcome, 'left');
  assert.equal(ends[0].leaveReason, 'page_exit');
  assert.equal(ends[0].score, 10);
  assert.equal(ends[0].levelScore, 10);
  assert.equal(ends[0].progress, 1 / 5);
  assert.equal(ends[0].fruitEaten, 1);
  assert.equal(ends[0].target, 5);
  assert.equal(f.controller.canAdvance(), false);
});

test('departing before a delayed start resolves cannot create phantom analytics', async () => {
  const f = fixture();
  const gate = deferred();
  f.sdk.gameStart = () => gate.promise;
  const starting = f.controller.startNewGame();
  await settle();
  f.controller.dispose('page_exit');
  gate.resolve();
  await starting;
  assert.deepEqual(f.recorded(), []);
  assert.equal(f.controller.getSnapshot().phase, 'menu');
});

test('collision during a pending pause is recorded immediately, even when the SDK rejects', async () => {
  const f = fixture();
  await f.controller.startNewGame();
  const gate = deferred();
  f.sdk.gamePause = () => gate.promise;
  const pausing = f.controller.togglePlayerPause();
  for (let i = 0; i < 10; i++) f.controller.tick();
  const end = f.recorded().find((e) => e.name === 'gameplay_ended');
  assert.equal(end.outcome, 'failed');
  assert.equal(end.failureReason, 'wall');
  const originalError = console.error;
  console.error = () => {};
  try {
    gate.reject(new Error('Pause unavailable'));
    await pausing;
  } finally {
    console.error = originalError;
  }
  f.controller.dispose('page_exit');
  assert.equal(f.recorded().filter((e) => e.name === 'gameplay_ended').length, 1);
});

for (const asynchronous of [false, true]) {
  test(`analytics ${asynchronous ? 'async rejection' : 'exception'} cannot interrupt gameplay`, async () => {
    let writes = 0;
    const f = fixture({ analyticsSink: { record() {
      writes++;
      if (asynchronous) return Promise.reject(new Error('Offline'));
      throw new Error('Quota exceeded');
    } } });
    await f.controller.startNewGame();
    await f.controller.quitToMenu();
    await f.controller.startNewGame();
    await f.controller.forceGameOver();
    await settle();
    assert.equal(writes, 4);
    assert.equal(f.controller.getTransitionError(), null);
    assert.equal(f.controller.getSnapshot().phase, 'game-over');
  });
}

test('analytics journal survives recreation, recovers corrupt data and bounds retention', async () => {
  const f = fixture();
  f.saved.set(ANALYTICS_STORAGE_KEY, '{broken');
  await f.controller.startNewGame();
  const event = f.recorded()[0];
  const journal = new FamobiAnalyticsStorage(f.sdk.storage);
  for (let i = 1; i <= ANALYTICS_EVENT_LIMIT; i++) journal.record({ ...event, eventId: `test:${i}` });
  assert.equal(f.recorded().length, ANALYTICS_EVENT_LIMIT);
  assert.equal(f.recorded()[0].eventId, 'test:1');
  assert.equal(f.recorded().at(-1).eventId, `test:${ANALYTICS_EVENT_LIMIT}`);
  for (const malformed of ['null', '{}', '42']) {
    f.saved.set(ANALYTICS_STORAGE_KEY, malformed);
    journal.record(event);
    assert.deepEqual(f.recorded(), [event]);
  }
  assert.equal(new FamobiGameStorage(f.sdk.storage).loadProfile().totalRuns, 1);
});
