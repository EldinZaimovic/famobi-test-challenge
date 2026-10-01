# Neon Snake · Analytics backend

A locally runnable game → Node.js API → Firebase Firestore emulator, with aggregated JSON ready for a future analytics frontend. The React dashboard is not included in this backend change. No Firebase account, real project, service account, API key, or deployment is needed.

## Quick start

Install **Node.js 22.12+** (Node 22 recommended; `.nvmrc` included), npm, and **Java 17 or 21** with `java` on your PATH. The pinned Firebase CLI 14.12.1 uses Firestore emulator 1.19.8, which works with Java 17. Newer Firebase CLI releases may require Java 21. The first install/start downloads npm packages and the emulator/UI from their official registries; subsequent local gameplay does not need internet.

From the repository root:

```sh
npm ci
npm run dev
```

| Component            | URL                              |
| -------------------- | -------------------------------- |
| Neon Snake game      | http://127.0.0.1:5174            |
| Firebase Emulator UI | http://127.0.0.1:4000            |
| API readiness        | http://127.0.0.1:3001/api/health |
| Firestore emulator   | 127.0.0.1:8080                   |

Keep that terminal open. `npm run dev` starts the emulator first, then the API and game Vite server; Ctrl-C stops the group and exports Firestore into the ignored `.emulator-data/` directory. The next run imports it (a missing directory on the first run is normal). Browser outboxes and game saves are separate localStorage data. A crash or forced shutdown can lose writes since the last export. Port conflicts fail startup instead of silently switching URLs.

The root **npm workspaces and `package-lock.json`** are the complete solution's install source. The game's older pnpm lockfile is retained only for its original standalone workflow; do not mix package managers in this checkout.

## Test the complete flow

1. Open the game and select **Start game**. Let the snake hit a wall.
2. Read `http://127.0.0.1:3001/api/dashboard?days=all` in a browser or run `curl 'http://127.0.0.1:3001/api/dashboard?days=all'`. The JSON contains a failed level-1 attempt, its duration, score, and event count.
3. Select **Try again**, then **Pause** → **Exit to menu**. This produces a separate attempt with outcome `left` and reason `menu`. Collect fruit to produce progress events; completing a level produces `completed`.
4. Add `&level=1` or choose `days=1`, `7`, or `30` to filter the response. Open Firebase Emulator UI → Firestore → `attempts` and inspect an attempt and its `events` subcollection.
5. Optionally run `npm run seed` in another terminal. It submits 12 deterministic demo attempts through the API, covering all three levels and all four outcomes. Re-running does not duplicate them. Synthetic occurrence times are fixed; query periods use server receipt time.
6. Stop with Ctrl-C, then run `npm run dev` again: the API data should survive the export/import cycle.

To verify outage recovery independently, run `npm run emulators` in one terminal, `FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 GCLOUD_PROJECT=demo-neon-snake npm run dev -w backend` in another, and the game Vite command below in a third terminal. Stop only the API, play a round, then restart it. The game stays playable; queued events retry, and duplicate delivery does not increase counts.

```sh
npm run dev:local -w neon-snake-main
```

Do not run this separate-terminal setup alongside `npm run dev`; they use the same ports. The environment variables above configure the **backend process only**, contain no secrets, and do not need an `.env` file.

Automated checks:

```sh
npm test                  # backend unit tests + real game/transport tests
npm run test:integration  # fresh, isolated Firestore emulator; no mocked database
npm run build             # game TypeScript check and build
npm run format:check      # new backend/docs formatting
```

The integration suite uses project `demo-neon-snake-test`, Firestore 8081, hub 4401, logging 4501 and websocket 9151. It imports no development data and never clears your development emulator. It covers real controller → retry transport → HTTP API → Firestore → aggregation response, concurrent deduplication, immutable event IDs, transaction rollback, out-of-order repair, filters/metrics, HTTP validation, and denying direct browser database access. Game tests also exercise actual simulation playthroughs of all three levels, lifecycle failures, and analytics isolation. No browser automation installation is required by these tests.

## Architecture and decisions

```text
neon-snake-main/       Existing Phaser/TypeScript game + analytics outbox
backend/src/          Express API, Zod validation, Firestore transactions and queries
backend/test/         Contract/unit tests and real emulator integration tests
scripts/seed.js       Repeatable sample events submitted through the API
firebase*.json        Local and isolated test emulator configuration
firestore.rules       Deny direct client access; only backend Admin SDK writes
```

The game already had typed version-1 events and a bounded Famobi storage journal. The integration retains that journal and adds an independent HTTP sink. Controller changes were unnecessary: analytics failures cannot affect movement, scoring, or SDK lifecycle transitions.

The root local command explicitly selects the checked-in, non-secret `.env.local-demo`, enabling a small **offline platform adapter**. It provides local saves and no-op platform/ad callbacks. This is an explicit development mode, not a silent SDK-failure fallback. `npm run dev -w neon-snake-main` and the default production game build still load the official Famobi SDK before game initialization, with the existing error handling. Local mode does not validate real Famobi ads or portal behavior. See [the game README](neon-snake-main/README.md) for those details.

The game uses Vite's same-origin `/api` proxy. It does not import Firebase or receive privileged credentials. The backend binds to `127.0.0.1`, requires a loopback `FIRESTORE_EMULATOR_HOST` and a `demo-` project ID, and fails closed otherwise. It never loads a service-account file. Firestore rules deny all direct client reads/writes; the backend Admin SDK is the trusted writer. This follows Firebase's documented [demo-project and Admin SDK emulator connection](https://firebase.google.com/docs/emulator-suite/connect_firestore) workflow.

### API contract

All successful responses and errors are JSON; responses are not cached.

| Method / path                       | Behavior                                                                                                                                                                                          |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/health`                   | Reads Firestore and returns `{ "status": "ok", "storage": "firestore-emulator" }`; 503 if unavailable.                                                                                            |
| `POST /api/events`                  | Body `{ "events": [...] }`, 1–50 events, `Content-Type: application/json`, maximum 64 KiB. Atomic batch. Returns 200 `{ "accepted": 2, "duplicates": 0 }` after commit.                           |
| `GET /api/dashboard?days=7&level=1` | `days`: `1`, `7` (default), `30`, or `all`; optional `level`: `1`, `2`, `3`. Returns summary, per-level metrics, latest 50 attempts, query metadata, server generation time, and truncation flag. |

Example accepted start event (Unix milliseconds):

```json
{
  "events": [
    {
      "schemaVersion": 1,
      "eventId": "d7e6a28c-13df-46b3-b508-3466e77938ef:1",
      "attemptId": "d7e6a28c-13df-46b3-b508-3466e77938ef",
      "name": "gameplay_started",
      "occurredAt": 1700000000000,
      "level": 1,
      "score": 0,
      "levelScore": 0,
      "progress": 0,
      "fruitEaten": 0,
      "target": 5,
      "durationMs": 0
    }
  ]
}
```

`gameplay_progress` uses the same fields. `gameplay_ended` additionally requires `outcome` (`completed`, `failed`, `left`), `failureReason` (`wall`, `snake`, `obstacle`, `external`, or null) and `leaveReason` (`menu`, `restart`, `replaced`, `page_exit`, `disposed`, or null). Reasons must match the outcome; non-applicable reasons must be null. A start/progress event must omit all three terminal fields.

Validation is strict and does not coerce strings into numbers. It rejects extra fields, unsupported versions, unsafe IDs, non-finite/negative measurements, future timestamps beyond five minutes, inconsistent progress/score/target values, and invalid terminal states. Targets are 5/7/9; fruit is worth 10/20/30 points by level. Total score must be at least level score. Duration is capped at seven days and cumulative score at one million. Start duration must be below one second. Old timestamps remain legal so an offline queue can be replayed.

Event IDs are `<attempt UUID>:<sequence>`: start is 1, fruit progress is fruit count + 1, and end is fruit count + 2. The backend checks consistent level/base score, monotonic duration and fruit counts, and that an end remains terminal across the entire stored history. Occurrence timestamps may go backwards if the client clock changes; duration comes from the game's monotonic clock. Validation catches contradictory data, but cannot prove an untrusted client's score is genuine.

Errors: 400 invalid body/query (with field paths), 403 foreign browser origin, 404 unknown route, 409 reused event ID with different data or contradictory history, 413 oversized body, 415 unsupported content type, and 503 storage failure. No stack traces are returned. A validation error or conflict writes **none** of the batch. Exact duplicates return 200 and do not mutate receipt times or increase totals.

### Firebase structure

```text
attempts/{attemptId}
  attemptId, level
  firstReceivedAt, lastReceivedAt      server Unix milliseconds
  startedAt, endedAt                  client occurrence time, or null
  startObserved, endObserved, completeHistory
  eventCount, lastSequence
  outcome                            completed | failed | left | unknown
  failureReason, leaveReason
  score, levelScore, progress, fruitEaten, target, durationMs

attempts/{attemptId}/events/{sequence}
  event                              exact validated version-1 payload
  receivedAt                         server Unix milliseconds
```

Every ingestion transaction reads existing attempt events, checks duplicates/conflicts, then writes new immutable event documents and the recomputed attempt summary together. Firestore retries concurrent conflicts, so parallel identical requests still count once. With this game's three finite levels, an attempt has at most 11 events. The stored projection lets the aggregation endpoint avoid scanning every raw event. It can be rebuilt from the raw history.

Out-of-order delivery and missing starts/progress are accepted: the highest sequence supplies the latest measurements, an observed end determines the outcome, and late events can repair `completeHistory`. A missing end means `unknown`, never an assumed failure or quit. A completed attempt may still have a partial history. No composite indexes are required for the current single-field query.

### Data preparation for the frontend

The backend queries attempts by **first server receipt** in the selected rolling window, orders newest first, then applies the level filter. This prevents client clock skew from changing the cohort. Late end events update their original attempt's cohort, not today's cohort. Queries examine at most 5,000 attempts (fetching one extra to detect truncation); if this limit is reached, the response explicitly identifies the sample with `truncated: true`. Level filtering happens after this cap.

Completion rate is `completed / (completed + failed + left)`. Unknown outcomes are excluded. Mean duration and mean **level-only** score use ended attempts only, avoiding double counting cumulative scores across levels. Zero denominators return null so a frontend can distinguish missing data from zero. Duration includes pauses. The latest 50 attempts include last-observed duration for unknown attempts, reasons, event counts, and history completeness. The API includes query metadata and generation time so a frontend can label the result and its freshness.

### Delivery, assumptions, and limitations

- The outbox persists up to 200 events in browser localStorage, sends sequentially, and retries network/5xx failures with exponential backoff from 1 to 30 seconds. Each request has an eight-second timeout. Reloading or coming online retries queued events. Permanent 400/409/413/415 responses drop only the offending event and log a warning.
- Departure uses best-effort `fetch(..., { keepalive: true })` for up to 50 queued events. Those events remain in the outbox until a normal acknowledged retry. Idempotent ingestion handles that duplicate safely. This is not a guarantee of delivery: queue eviction, blocked storage, abrupt process termination, multiple tabs writing the same localStorage key, or never returning can lose events. No background service worker is included.
- Each level entry/retry is an attempt. There are no player identifiers, sessions spanning levels, device metadata, leaderboards, or retention metrics. The game sends progress per fruit, not per frame.
- This is a loopback-only, unauthenticated local development service. Origin checks and body/schema bounds are included; authentication, per-client rate limiting, retention/TTL, production authorization and anti-cheat are intentionally outside scope. Firestore emulator behavior is not proof of production performance or security readiness.
- The aggregation endpoint scans a bounded set and is intended for small local datasets. It does not offer raw-event export or pagination beyond its latest 50 attempts. A dashboard can consume this API in a later change.
- Firebase CLI is pinned for reproducibility/Java 17 compatibility; its transitive dependencies can emit deprecation/engine warnings on newer Node versions. The existing Phaser bundle produces a size warning. Neither prevented the verified checks.

## With more time

Move the outbox to IndexedDB with cross-tab coordination, retry jitter, and observable delivery/drop counters. Add authenticated ingestion and dashboard access, rate limits, structured logs, explicit game-build/schema evolution, and data retention. Replace bounded request-time aggregation with maintained daily/level aggregates and cursor pagination as volume grows. Add browser automation in CI, contract-generated client types, responsive/accessibility regression checks, and a migration/rebuild command for projections.

## Material use of external tools

OpenAI Codex materially assisted with the backend/API and schema design, game transport and local adapter, emulator configuration, test implementation, documentation, and debugging. Its terminal tools ran npm/Node/Firebase tests and builds; its browser tools verified local gameplay and event delivery. Firebase's official documentation was consulted for demo-project and Admin SDK emulator behavior. Dependencies come from npm, and the emulator comes from Firebase's official download service. The supplied game and its existing SDK integration were used as the starting point. No credentials or private datasets were needed. This disclosure describes the development assistance; the code and technical decisions remain reviewable and modifiable in this repository.
