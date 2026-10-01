import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "vite";
import { createDatabase } from "../src/firebase.js";
import { createApp } from "../src/app.js";
import { history } from "./fixtures.js";

let db, server, base, game, buildDir;
const post = (events) =>
  fetch(`${base}/api/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ events }),
  });
const view = async (query = "") =>
  (await fetch(`${base}/api/dashboard?days=all${query}`)).json();
before(async () => {
  assert.equal(
    process.env.GCLOUD_PROJECT,
    "demo-neon-snake-test",
    "Run npm run test:integration (isolated emulator)",
  );
  db = createDatabase();
  server = createApp(db).listen(0, "127.0.0.1");
  await once(server, "listening");
  base = `http://127.0.0.1:${server.address().port}`;
  buildDir = await mkdtemp(join(tmpdir(), "neon-integration-"));
  await build({
    configFile: false,
    logLevel: "error",
    build: {
      outDir: buildDir,
      lib: {
        entry: "backend/test/game-entry.js",
        formats: ["es"],
        fileName: () => "game.mjs",
      },
    },
  });
  game = await import(pathToFileURL(join(buildDir, "game.mjs")));
});
after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  if (db) await db.terminate();
  if (buildDir) await rm(buildDir, { recursive: true, force: true });
});

test("health checks the actual emulator", async () => {
  assert.equal((await fetch(`${base}/api/health`)).status, 200);
});
test("real controller → HTTP outbox → API → Firestore → dashboard", async () => {
  global.window = {};
  const storage = new Map();
  const transport = new game.HttpAnalyticsSink(
    {
      getItem: (key) => storage.get(key),
      setItem: (key, value) => storage.set(key, value),
    },
    fetch,
    `${base}/api/events`,
  );
  const events = [];
  const noop = () => {};
  const platform = {
    ready: noop,
    start: async () => {},
    end: async () => {},
    pause: async () => {},
    resume: async () => {},
    score: noop,
    progress: noop,
    muted: noop,
  };
  const profileStorage = {
    loadProfile: () => ({
      bestScore: 0,
      totalRuns: 0,
      highestUnlockedLevel: 1,
      playerMuted: true,
    }),
    saveProfile: noop,
  };
  const controller = new game.GameController(
    new game.SnakeGame(),
    profileStorage,
    platform,
    true,
    new game.GameplayAnalytics({
      record: (e) => {
        events.push(e);
        transport.record(e);
      },
    }),
  );
  controller.markReady();
  await controller.startNewGame();
  await controller.forceGameOver();
  for (let tries = 0; tries < 100; tries++) {
    await transport.flush();
    if (JSON.parse(storage.get("neon-snake:outbox:v1") ?? "[]").length === 0)
      break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  transport.dispose();
  controller.dispose();
  assert.equal(events.length, 2);
  const attempt = (
    await db.doc(`attempts/${events[0].attemptId}`).get()
  ).data();
  assert.equal(attempt.outcome, "failed");
  assert.equal(attempt.failureReason, "external");
  assert.equal(attempt.completeHistory, true);
  assert.equal(
    (await view()).recentAttempts.some(
      (a) => a.attemptId === attempt.attemptId,
    ),
    true,
  );
});
test("concurrent duplicate submissions count only once and retain immutable raw events", async () => {
  const events = history();
  const results = await Promise.all([post(events), post(events), post(events)]);
  for (const response of results) assert.equal(response.status, 200);
  const bodies = await Promise.all(results.map((r) => r.json()));
  assert.equal(
    bodies.reduce((n, r) => n + r.accepted, 0),
    events.length,
  );
  const ref = db.doc(`attempts/${events[0].attemptId}`);
  assert.equal((await ref.collection("events").get()).size, events.length);
  assert.deepEqual(
    (await ref.collection("events").doc("1").get()).data().event,
    events[0],
  );
  const conflict = await post([
    { ...events[0], occurredAt: events[0].occurredAt - 1 },
  ]);
  assert.equal(conflict.status, 409);
});
test("late starts repair a partial history without losing the end or changing first receipt", async () => {
  const events = history({ level: 2 });
  assert.equal((await post([events.at(-1)])).status, 200);
  const ref = db.doc(`attempts/${events[0].attemptId}`);
  const partial = (await ref.get()).data();
  assert.equal(partial.startObserved, false);
  assert.equal(partial.outcome, "completed");
  assert.equal((await post(events.slice(0, -1).reverse())).status, 200);
  const repaired = (await ref.get()).data();
  assert.equal(repaired.completeHistory, true);
  assert.equal(repaired.firstReceivedAt, partial.firstReceivedAt);
  assert.equal(repaired.levelScore, 140);
});
test("invalid and conflicting batches commit nothing, including otherwise valid attempts", async () => {
  const valid = history();
  const invalid = { ...history()[0], level: 99 };
  assert.equal((await post([valid[0], invalid])).status, 400);
  assert.equal(
    (await db.doc(`attempts/${valid[0].attemptId}`).get()).exists,
    false,
  );
  const existing = history();
  await post(existing);
  assert.equal(
    (await post([valid[0], { ...existing[0], score: 10 }])).status,
    409,
  );
  assert.equal(
    (await db.doc(`attempts/${valid[0].attemptId}`).get()).exists,
    false,
  );
});
test("filters and aggregation agree with stored attempts, including unknown and empty views", async () => {
  const events = history({ level: 3, outcome: "left" });
  await post([events[0]]);
  const result = await view("&level=3");
  assert.equal(result.summary.attempts, 1);
  assert.equal(result.summary.unknown, 1);
  assert.equal(result.summary.completionRate, null);
  await post(events.slice(1));
  const ended = await view("&level=3");
  assert.equal(ended.summary.left, 1);
  assert.equal(ended.summary.averageLevelScore, 30);
  await db
    .doc(`attempts/${events[0].attemptId}`)
    .update({ firstReceivedAt: Date.now() - 40 * 86400_000 });
  const empty = await (
    await fetch(`${base}/api/dashboard?days=7&level=3`)
  ).json();
  assert.equal(empty.summary.attempts, 0);
  assert.equal(empty.summary.completionRate, null);
});
test("HTTP boundary rejects malformed JSON, oversized payloads, foreign origins and invalid filters", async () => {
  const raw = (body, headers = { "Content-Type": "application/json" }) =>
    fetch(`${base}/api/events`, { method: "POST", headers, body });
  assert.equal((await raw("{")).status, 400);
  assert.equal(
    (await raw(JSON.stringify({ events: [], padding: "x".repeat(70_000) })))
      .status,
    413,
  );
  assert.equal((await raw("{}", { "Content-Type": "text/plain" })).status, 415);
  assert.equal(
    (
      await raw("{}", {
        "Content-Type": "application/json",
        Origin: "https://example.com",
      })
    ).status,
    403,
  );
  assert.equal((await fetch(`${base}/api/dashboard?level=4`)).status, 400);
  assert.equal((await fetch(`${base}/missing`)).status, 404);
});
test("Firestore rules deny direct browser reads and writes", async () => {
  const url = `http://${process.env.FIRESTORE_EMULATOR_HOST}/v1/projects/${process.env.GCLOUD_PROJECT}/databases/(default)/documents/attempts/direct`;
  assert.equal((await fetch(url)).status, 403);
  assert.equal(
    (
      await fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fields: {} }),
      })
    ).status,
    403,
  );
});
