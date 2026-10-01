import { test } from "node:test";
import assert from "node:assert/strict";
import { batchSchema, projectAttempt, querySchema } from "../src/validation.js";
import { createDatabase } from "../src/firebase.js";
import { aggregate } from "../src/store.js";
import { buildActivity, buildFailureReasons } from "../src/dashboardCharts.js";
import { history } from "./fixtures.js";

test("validates all real level shapes and terminal outcomes", () => {
  for (const level of [1, 2, 3])
    for (const outcome of ["completed", "failed", "left"]) {
      assert.deepEqual(
        batchSchema.parse({ events: history({ level, outcome }) }).events
          .length,
        history({ level, outcome }).length,
      );
    }
});
test("rejects unknown fields, bad IDs, scores, times, counts, outcomes, and numeric coercion", () => {
  const events = history();
  for (const change of [
    { token: "secret" },
    { schemaVersion: 2 },
    { attemptId: "../bad" },
    { eventId: "incorrect" },
    { progress: 0.3 },
    { score: "0" },
    { levelScore: 5 },
    { target: 7 },
    { level: 0 },
    { durationMs: -1 },
    { durationMs: Infinity },
    { occurredAt: Date.now() + 600_000 },
    { name: "unknown" },
    { outcome: "completed" },
  ])
    assert.equal(
      batchSchema.safeParse({ events: [{ ...events[0], ...change }] }).success,
      false,
      JSON.stringify(change),
    );
  for (const change of [
    { outcome: undefined },
    { failureReason: "wall" },
    { leaveReason: "menu" },
    { outcome: "failed" },
  ]) {
    assert.equal(
      batchSchema.safeParse({ events: [{ ...events.at(-1), ...change }] })
        .success,
      false,
    );
  }
  assert.equal(batchSchema.safeParse({ events: [] }).success, false);
  assert.equal(
    batchSchema.safeParse({ events: Array(51).fill(events[0]) }).success,
    false,
  );
  assert.equal(querySchema.safeParse({ days: "forever" }).success, false);
});
test("projects out-of-order and missing events without inferring an outcome", () => {
  const events = history();
  const ended = projectAttempt([...events].reverse(), 10);
  assert.equal(ended.outcome, "completed");
  assert.equal(ended.completeHistory, true);
  assert.equal(projectAttempt([events.at(-1)], 10).completeHistory, false);
  const partial = projectAttempt([events[1]], 12, { firstReceivedAt: 10 });
  assert.equal(partial.outcome, "unknown");
  assert.equal(partial.startObserved, false);
  assert.equal(partial.firstReceivedAt, 10);
  assert.throws(
    () => projectAttempt([events[0], { ...events[1], score: 100 }], 10),
    /contradict/,
  );
  assert.throws(
    () => projectAttempt([events[1], { ...events[2], durationMs: 1 }], 10),
    /contradict/,
  );
});
test("dashboard denominators exclude unknown attempts and use level-only scores", () => {
  const attempts = ["completed", "failed", "left"].map((outcome) =>
    projectAttempt(history({ outcome }), 10),
  );
  attempts.push(projectAttempt([history()[0]], 10));
  const result = aggregate(attempts);
  assert.equal(result.attempts, 4);
  assert.equal(result.unknown, 1);
  assert.equal(result.completionRate, 1 / 3);
  assert.equal(result.averageLevelScore, 70 / 3);
  assert.equal(aggregate([]).completionRate, null);
  assert.equal(aggregate([]).averageDurationMs, null);
});
test("Firebase connection fails closed without an explicit loopback emulator", () => {
  for (const env of [
    {},
    { FIRESTORE_EMULATOR_HOST: "remote:8080" },
    {
      FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080",
      GCLOUD_PROJECT: "real-project",
    },
  ]) {
    assert.throws(() => createDatabase(env), /Requires/);
  }
});

test("activity buckets preserve UTC boundaries, zero intervals and original receipt cohorts", () => {
  const now = Date.UTC(2026, 9, 1, 12, 30);
  const from = now - 86400_000;
  const activity = buildActivity(
    [
      { firstReceivedAt: from, endObserved: false, outcome: "unknown" },
      {
        firstReceivedAt: Date.UTC(2026, 9, 1, 0),
        endedAt: now,
        endObserved: true,
        outcome: "completed",
      },
      { firstReceivedAt: now, endObserved: true, outcome: "failed" },
    ],
    { days: "1", from, now },
  );
  assert.equal(activity.intervalMs, 3600_000);
  assert.equal(activity.buckets.length, 25);
  assert.equal(activity.buckets[0].attempts, 1);
  assert.equal(activity.buckets[1].attempts, 0);
  const midnight = activity.buckets.find(
    (b) => b.receivedAt === Date.UTC(2026, 9, 1),
  );
  assert.equal(midnight.completed, 1);
  assert.equal(activity.buckets.at(-1).completed, 0);
  assert.equal(
    activity.buckets.reduce((n, b) => n + b.attempts, 0),
    3,
  );
});

test("all-time activity stays bounded across years and handles empty and single-interval cohorts", () => {
  const now = Date.UTC(2026, 9, 1);
  const attempts = [
    { firstReceivedAt: Date.UTC(2010, 0, 1) },
    { firstReceivedAt: now },
  ];
  const activity = buildActivity(attempts, { days: "all", from: 0, now });
  assert.ok(activity.buckets.length <= 32);
  assert.ok(activity.intervalMs > 86400_000);
  assert.equal(
    activity.buckets.reduce((n, b) => n + b.attempts, 0),
    2,
  );
  assert.equal(
    buildActivity([], { days: "all", from: 0, now }).buckets.length,
    1,
  );
  assert.equal(
    buildActivity([attempts[1]], { days: "all", from: 0, now }).buckets[0]
      .attempts,
    1,
  );
  const daily = buildActivity([], {
    days: "7",
    from: now - 7 * 86400_000,
    now,
  });
  assert.equal(daily.intervalMs, 86400_000);
  assert.equal(daily.buckets.length, 8);
  assert.ok(daily.buckets.every((bucket) => bucket.attempts === 0));
});

test("failure causes count only recorded failures and preserve missing reasons", () => {
  assert.deepEqual(
    buildFailureReasons([
      { outcome: "failed", endObserved: true, failureReason: "wall" },
      { outcome: "failed", endObserved: true, failureReason: "wall" },
      { outcome: "failed", endObserved: true, failureReason: "snake" },
      { outcome: "failed", endObserved: true, failureReason: null },
      { outcome: "unknown", endObserved: false, failureReason: "wall" },
      { outcome: "left", endObserved: true, failureReason: null },
    ]),
    [
      { reason: "wall", count: 2 },
      { reason: "snake", count: 1 },
      { reason: "unrecorded", count: 1 },
    ],
  );
  assert.deepEqual(buildFailureReasons([]), []);
});
