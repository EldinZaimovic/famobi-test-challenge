import { z } from "zod";

const integer = (max) => z.number().int().min(0).max(max);
const event = z
  .object({
    schemaVersion: z.literal(1),
    eventId: z.string().max(80),
    attemptId: z.string().uuid(),
    name: z.enum(["gameplay_started", "gameplay_progress", "gameplay_ended"]),
    occurredAt: integer(8_640_000_000_000_000),
    level: z.number().int().min(1).max(3),
    score: integer(1_000_000),
    levelScore: integer(270),
    progress: z.number().min(0).max(1),
    fruitEaten: integer(9),
    target: z.union([z.literal(5), z.literal(7), z.literal(9)]),
    durationMs: z
      .number()
      .min(0)
      .max(7 * 86400_000),
    outcome: z.enum(["completed", "failed", "left"]).optional(),
    failureReason: z
      .enum(["wall", "snake", "obstacle", "external"])
      .nullable()
      .optional(),
    leaveReason: z
      .enum(["menu", "restart", "replaced", "page_exit", "disposed"])
      .nullable()
      .optional(),
  })
  .strict()
  .superRefine((e, ctx) => {
    const check = (ok, message) => {
      if (!ok) ctx.addIssue({ code: "custom", message });
    };
    const sequence =
      e.name === "gameplay_started"
        ? 1
        : e.fruitEaten + (e.name === "gameplay_progress" ? 1 : 2);
    check(
      e.eventId === `${e.attemptId}:${sequence}`,
      "eventId must match attemptId and event sequence",
    );
    check(e.target === [5, 7, 9][e.level - 1], "target must match level");
    check(
      e.fruitEaten <= e.target &&
        Math.abs(e.progress - e.fruitEaten / e.target) < 1e-9,
      "progress must match fruitEaten / target",
    );
    check(
      e.levelScore === e.fruitEaten * e.level * 10 && e.score >= e.levelScore,
      "invalid score",
    );
    check(
      e.occurredAt <= Date.now() + 5 * 60_000,
      "occurredAt is more than five minutes in the future",
    );
    if (e.name === "gameplay_started")
      check(
        e.fruitEaten === 0 && e.durationMs < 1000,
        "start must have zero progress and near-zero duration",
      );
    if (e.name === "gameplay_progress")
      check(e.fruitEaten > 0, "progress requires fruit");
    if (e.name !== "gameplay_ended") {
      check(
        e.outcome === undefined &&
          e.failureReason === undefined &&
          e.leaveReason === undefined,
        "only end events have outcome/reasons",
      );
    } else {
      check(e.outcome !== undefined, "end requires outcome");
      check(
        e.outcome === "failed"
          ? Boolean(e.failureReason)
          : e.failureReason === null,
        "invalid failureReason for outcome",
      );
      check(
        e.outcome === "left" ? Boolean(e.leaveReason) : e.leaveReason === null,
        "invalid leaveReason for outcome",
      );
      check(
        e.outcome === "completed" ? e.progress === 1 : e.progress < 1,
        "outcome does not match progress",
      );
    }
  });

export const batchSchema = z
  .object({ events: z.array(event).min(1).max(50) })
  .strict();
export const querySchema = z
  .object({
    days: z.enum(["1", "7", "30", "all"]).default("7"),
    level: z.enum(["1", "2", "3"]).optional(),
    outcome: z.enum(["completed", "failed", "left", "unknown"]).optional(),
  })
  .strict();
export const sequenceOf = (event) => Number(event.eventId.split(":").at(-1));
export class ConflictError extends Error {}

// Gaps and late events are legal. Contradictory histories are not.
export function projectAttempt(events, receivedAt, previous) {
  const ordered = [...events].sort((a, b) => sequenceOf(a) - sequenceOf(b));
  const first = ordered[0];
  let prior;
  for (const current of ordered) {
    if (
      current.level !== first.level ||
      current.score - current.levelScore !== first.score - first.levelScore ||
      (prior &&
        (prior.name === "gameplay_ended" ||
          current.durationMs < prior.durationMs ||
          current.fruitEaten < prior.fruitEaten))
    ) {
      throw new ConflictError("Events contradict the attempt history");
    }
    prior = current;
  }
  const latest = ordered.at(-1);
  const start = ordered.find((e) => e.name === "gameplay_started");
  const end = ordered.find((e) => e.name === "gameplay_ended");
  return {
    attemptId: first.attemptId,
    level: first.level,
    firstReceivedAt: previous?.firstReceivedAt ?? receivedAt,
    lastReceivedAt: receivedAt,
    startedAt: start?.occurredAt ?? null,
    endedAt: end?.occurredAt ?? null,
    startObserved: Boolean(start),
    endObserved: Boolean(end),
    eventCount: ordered.length,
    lastSequence: sequenceOf(latest),
    completeHistory: Boolean(
      start && end && ordered.length === sequenceOf(end),
    ),
    outcome: end?.outcome ?? "unknown",
    failureReason: end?.failureReason ?? null,
    leaveReason: end?.leaveReason ?? null,
    score: latest.score,
    levelScore: latest.levelScore,
    progress: latest.progress,
    fruitEaten: latest.fruitEaten,
    target: latest.target,
    durationMs: latest.durationMs,
  };
}
