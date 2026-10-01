# Neon Snake

A compact browser game built with Phaser 3, TypeScript, Vite, and a DOM-based interface.

The game integrates the Famobi GameInterface SDK. The SDK owns initialization, lifecycle reporting, storage, external pause/mute, and interstitial ad slots. No backend or dashboard is required.

## Gameplay

- Clear three increasingly fast levels.
- Eat the required number of fruit to advance.
- Avoid walls, your own trail, and level obstacles.
- Pause, resume, retry, or return to the main menu.
- Unlock levels, retain a best score, and restore mute preferences between sessions.
- Hear lightweight procedural sound effects without external audio assets.
- Play with arrow keys, WASD, swipe gestures, or the on-screen direction pad.

## Run locally

Requirements: Node.js 22 or newer and pnpm.

```bash
pnpm install
pnpm dev
```

Then open the local URL printed by Vite.

## Checks

```bash
pnpm check
pnpm test
pnpm build
pnpm preview
```

## Project structure

```text
src/
├── application/
│   ├── GameController.ts
│   └── gameEvents.ts
├── core/
│   ├── audio/
│   │   └── GameAudio.ts
│   ├── events/
│   │   └── EventBus.ts
│   └── storage/
│       └── GameStorage.ts
├── game/
│   ├── GameRenderer.ts
│   ├── input.ts
│   ├── levels.ts
│   ├── scenes/
│   │   └── SnakeScene.ts
│   ├── snakeGame.ts
│   └── types.ts
├── platform/
│   ├── FamobiPlatform.ts
│   ├── FamobiSdk.ts
│   └── GamePlatform.ts
├── bootstrap.ts
├── main.ts
└── style.css
```

The game simulation remains independent from Phaser. An application controller coordinates commands, persistence, audio, and domain events. The Phaser scene adapts simulation state into graphics and input, while the HUD and menus remain accessible DOM elements.

Player preferences, the best score, run count, and unlocked levels are saved through `GameInterface.storage`, which scopes saves to the Famobi game ID. Audio is generated in the browser without external media files.

The included workflow builds and deploys the game whenever the default branch is updated.

## License

MIT

## Famobi integration

The implementation follows the current [start/loading](https://docs.famobi.com/start),
[game lifecycle](https://docs.famobi.com/game), [pause](https://docs.famobi.com/pause),
and [API](https://docs.famobi.com/api) documentation.

- `index.html` loads the official `https://api.games.famobi.com/init.js` in its head.
- `src/bootstrap.ts` calls `FamobiPlatform.initialize`, which passes a module-loading callback to `GameInterface.init`.
  Phaser, the game, and its CSS are imported only when the SDK invokes that callback.
  The adapter awaits both the init promise and the module import before constructing
  Phaser. Production module preloading is disabled so it cannot bypass the SDK gate.
- Loading milestones are 0 (begin loading game modules), 90 (modules and CSS loaded),
  and 100 (procedural scene drawn and controls installed). `gameReady` fires once,
  after the title screen is interactive. This game has no external image/audio assets.
- `src/platform/FamobiPlatform.ts` adapts the typed SDK to the controller.
  The simulation stays independent of Famobi and Phaser.
- The controller uses the simulation as its single source of game state. One
  `pendingTransition` value identifies starting, ending, pausing, or resuming.
  There is no second display snapshot or pending-end queue. The UI waits to show
  results while a transition is in flight. Level-score calculation belongs to the
  controller; the adapter only forwards the supplied value.
- `GameRenderer` overrides Phaser's protected visibility hooks. Other systems keep
  their listeners, and the scene accesses only the controller, never the SDK.
- SDK initialization failure displays a reload action. Rejected lifecycle calls freeze
  the run and show a reload action instead of silently continuing without acknowledgment.

| Game moment | SDK event / behavior |
| --- | --- |
| Start, retry, selected or next level | Await `gameStart(level)` before starting simulation and timers. |
| Fruit collected | `sendScore(score, {type: 'live', level})`; score is cumulative across the current playthrough. |
| Level progress | `sendProgress(round(fruitEaten / target * 100))`; resets to 0 on every level start/retry and reaches 100 on completion. |
| Level complete | Submit level-only and cumulative total scores, then await `gameEnd('complete')` before exposing results. |
| Wall, body, obstacle, or external failure | Submit scores and await `gameEnd('fail')` before results/retry. |
| Quit an active level or restart it | Await `gameEnd('quit')`; a restart then awaits a fresh `gameStart`. Leaving an already-ended result screen sends no duplicate end. |
| All three levels cleared | Await the final `gameEnd('complete')`, then `gameFinished`, then display the final result. |
| Player pause / resume | Await `gamePause` / `gameResume`. While pause acknowledgment is pending, movement and steering continue; duplicate transition commands are blocked. |
| SDK pause | Freeze immediately, block input, show a passive interruption overlay; preserve a separate player pause flag and do not echo player pause events. |
| SDK mute | Stop scheduled tones immediately; preserve the player's own mute preference. |
| Hidden tab | Combine visibility pause/mute with SDK state when `hasFeature('visibilitychange')` is enabled. Recheck SDK state on return. `GameRenderer` overrides Phaser's automatic loop controls without removing any event listeners. |

Each end event includes score, fruit count, failure reason, and elapsed wall-clock
`durationMs` (including pauses). The SDK can also request home, quit, restart,
level selection, next level from completed levels, or game over.

Interstitial slots are provided on start/retry/next-level, pause, and resume.
Their promises are awaited; IDs are declared in `public/famobi.json`, copied next
to `dist/index.html` with `maxLevels: 3`. The game has no rewarded mechanics,
stages, or purchases, so no events are fabricated for those features.

The pause/audio buttons and score/progress HUD respect their SDK feature flags.
The home link now quits through the controller instead of reloading an active run.

## Local verification

Run from this directory:

```bash
pnpm install --frozen-lockfile
pnpm test
pnpm build
pnpm preview --host 127.0.0.1 --port 4174
```

The automated suite bundles the real TypeScript controller, simulation, storage,
audio, and SDK adapter with Vite and runs Node's built-in test runner. It supplies
an instrumented SDK double to control promise resolution and assert call ordering;
it is never included in the shipped game. The suite covers:

- initialization holds, both module/init completion orders, load failures, and
  100%-before-ready ordering;
- delayed starts, duplicate clicks, rejected start/end/pause/resume calls, delayed
  results and retries;
- quit/restart event ordering and avoiding duplicate end events;
- player/system pause nesting, external pause arriving during a pending start,
  visibility behavior, initial SDK pause/mute, and mute preference preservation;
- movement and steering while pause acknowledgment is pending, collision during
  that wait, external pause during resume, and disabled player pause;
- a deterministic playthrough of all three real levels, asserting level scores
  **50 / 140 / 270**, cumulative totals **50 / 190 / 460**, progress resets,
  unlock persistence, and final completion ordering;
- invalid saved data and immediate muting of already scheduled audio.

Browser checks use the **real hosted Famobi localTester SDK**, not the test double:

1. Open `http://127.0.0.1:4174/?holdInit=1&showLoadingOverlay=1`.
   Before pressing the SDK's **START**, there must be no canvas or Phaser/game
   module loaded. In the production HTML, there are no module-preload links.
2. Press **START**. Confirm console loading events 0 → 90 → 100 → `gameReady`,
   the loading overlay closes, and the title screen becomes interactive.
3. Start and let the snake hit a wall. Confirm one start/end pair and a retry
   screen. Retry, pause, resume, and exit to menu. Check the corresponding events.
   The local tester currently logs `gameOver()` / `gameQuit()` internally when
   the game calls the documented `gameEnd('fail')` / `gameEnd('quit')` API.
4. Open the SDK's **☰** menu. Pause externally while already player-paused,
   then resume externally: the player pause must remain. Mute in the game and
   toggle external mute/unmute: the player's setting must remain.
5. Add `&skipAdValidation=1&eventDelay=1000` to force test ads and delay lifecycle
   promises. During an ad, start, end, or resume transition the snake must not move.
   During a pending **pause** acknowledgment it must keep moving and accepting
   direction input, unless the SDK externally pauses it. Repeated transition
   commands must not start another run. Close the ad and verify normal continuation.
6. Use `&gameId=neon-snake-integration-test` for an isolated save. Toggle mute,
   reload with the same ID, and verify persistence. A different game ID starts
   with a separate profile. Switching tabs must not clear external pause/mute.

Verified locally on 2026-10-01: all 20 automated tests and TypeScript/production
build passed. Dev and production browser runs confirmed initialization gating,
loading/ready, start, collision/failure, retry, quit, and player/external pause handling.
A reload with the same game ID restored the saved mute preference.
The production build was also exercised with the SDK's forced test ads and delayed
events. These are local SDK integration checks; live portal ad delivery and
production analytics ingestion require verification in Famobi's hosting environment.
The build reports a size warning for the Phaser bundle; it does not fail the build.

Famobi's loader automatically provides the local tester on localhost. A production
portal supplies its own SDK environment; a standalone arbitrary host is not a
substitute for Famobi-hosted acceptance testing.
