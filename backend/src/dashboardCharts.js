const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

export function buildActivity(attempts, { days, from, now }) {
  const first =
    days === "all"
      ? attempts.reduce(
          (oldest, attempt) => Math.min(oldest, attempt.firstReceivedAt),
          now,
        )
      : from;
  // Bound all-time responses even when the selected cohort spans years.
  const intervalMs =
    days === "1"
      ? HOUR_MS
      : days === "all"
        ? Math.max(1, Math.ceil((now - first) / DAY_MS / 30)) * DAY_MS
        : DAY_MS;
  const start = Math.floor(first / intervalMs) * intervalMs;
  const end = Math.floor(now / intervalMs) * intervalMs;
  const buckets = Array.from(
    { length: (end - start) / intervalMs + 1 },
    (_, index) => ({
      receivedAt: start + index * intervalMs,
      attempts: 0,
      completed: 0,
    }),
  );
  for (const attempt of attempts) {
    const bucket =
      buckets[Math.floor((attempt.firstReceivedAt - start) / intervalMs)];
    if (bucket) {
      bucket.attempts++;
      if (attempt.endObserved && attempt.outcome === "completed")
        bucket.completed++;
    }
  }
  return { intervalMs, buckets };
}

export function buildFailureReasons(attempts) {
  const counts = new Map();
  for (const attempt of attempts) {
    if (!attempt.endObserved || attempt.outcome !== "failed") continue;
    const reason = attempt.failureReason ?? "unrecorded";
    counts.set(reason, (counts.get(reason) ?? 0) + 1);
  }
  return [...counts]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason));
}
