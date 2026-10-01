import { randomUUID } from "node:crypto";
export function history({
  level = 1,
  outcome = "completed",
  fruit = outcome === "completed" ? [5, 7, 9][level - 1] : 1,
  attemptId = randomUUID(),
  occurredAt = Date.now() - 60_000,
} = {}) {
  const target = [5, 7, 9][level - 1];
  const make = (count, name, sequence) => ({
    schemaVersion: 1,
    eventId: `${attemptId}:${sequence}`,
    attemptId,
    name,
    occurredAt: occurredAt + sequence * 100,
    level,
    score: count * level * 10,
    levelScore: count * level * 10,
    progress: count / target,
    fruitEaten: count,
    target,
    durationMs: name === "gameplay_started" ? 0 : sequence * 100,
  });
  return [
    make(0, "gameplay_started", 1),
    ...Array.from({ length: fruit }, (_, i) =>
      make(i + 1, "gameplay_progress", i + 2),
    ),
    {
      ...make(fruit, "gameplay_ended", fruit + 2),
      outcome,
      failureReason: outcome === "failed" ? "wall" : null,
      leaveReason: outcome === "left" ? "menu" : null,
    },
  ];
}
