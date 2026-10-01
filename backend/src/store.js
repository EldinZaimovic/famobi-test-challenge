import { isDeepStrictEqual } from "node:util";
import { ConflictError, projectAttempt, sequenceOf } from "./validation.js";

export async function ingest(db, events) {
  const groups = Map.groupBy(events, (e) => e.attemptId);
  return db.runTransaction(async (tx) => {
    const writes = [];
    let accepted = 0;
    let duplicates = 0;
    const receivedAt = Date.now();
    // All transaction reads precede writes. Retries also recheck event IDs.
    for (const [attemptId, incoming] of groups) {
      const ref = db.collection("attempts").doc(attemptId);
      const [attempt, stored] = await Promise.all([
        tx.get(ref),
        tx.get(ref.collection("events")),
      ]);
      const all = new Map(stored.docs.map((doc) => [doc.id, doc.data().event]));
      const fresh = [];
      for (const event of incoming) {
        const id = String(sequenceOf(event));
        if (all.has(id)) {
          if (!isDeepStrictEqual(all.get(id), event))
            throw new ConflictError(
              "eventId already exists with different data",
            );
          duplicates++;
        } else {
          all.set(id, event);
          fresh.push({
            ref: ref.collection("events").doc(id),
            data: { event, receivedAt },
          });
          accepted++;
        }
      }
      if (fresh.length) {
        const summary = projectAttempt(
          [...all.values()],
          receivedAt,
          attempt.data(),
        );
        writes.push(...fresh, { ref, data: summary });
      }
    }
    for (const write of writes) tx.set(write.ref, write.data);
    return { accepted, duplicates };
  });
}

export function aggregate(attempts) {
  const ended = attempts.filter((a) => a.endObserved);
  const completed = ended.filter((a) => a.outcome === "completed").length;
  return {
    attempts: attempts.length,
    events: attempts.reduce((n, a) => n + a.eventCount, 0),
    completed,
    failed: ended.filter((a) => a.outcome === "failed").length,
    left: ended.filter((a) => a.outcome === "left").length,
    unknown: attempts.length - ended.length,
    incompleteHistories: attempts.filter((a) => !a.completeHistory).length,
    completionRate: ended.length ? completed / ended.length : null,
    averageDurationMs: ended.length
      ? ended.reduce((n, a) => n + a.durationMs, 0) / ended.length
      : null,
    averageLevelScore: ended.length
      ? ended.reduce((n, a) => n + a.levelScore, 0) / ended.length
      : null,
  };
}

export async function dashboard(db, { days, level }) {
  const now = Date.now();
  const from = days === "all" ? 0 : now - Number(days) * 86400_000;
  // A bounded local demo query. Report truncation explicitly; never imply global totals.
  const snapshot = await db
    .collection("attempts")
    .where("firstReceivedAt", ">=", from)
    .orderBy("firstReceivedAt", "desc")
    .limit(5001)
    .get();
  const truncated = snapshot.size > 5000;
  const attempts = snapshot.docs
    .slice(0, 5000)
    .map((doc) => doc.data())
    .filter((a) => !level || a.level === Number(level));
  return {
    generatedAt: now,
    window: { days, level: level ?? null, from, basis: "firstReceivedAt" },
    truncated,
    scannedAttempts: Math.min(snapshot.size, 5000),
    summary: aggregate(attempts),
    levels: [1, 2, 3]
      .filter((n) => !level || n === Number(level))
      .map((level) => ({
        level,
        ...aggregate(attempts.filter((a) => a.level === level)),
      })),
    recentAttempts: attempts.slice(0, 50),
  };
}
