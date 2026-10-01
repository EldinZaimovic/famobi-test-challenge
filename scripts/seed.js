import { history } from "../backend/test/fixtures.js";
// Send deterministic IDs through the public validation path. Re-running is idempotent.
const events = [1, 2, 3].flatMap((level) =>
  ["completed", "failed", "left", "unknown"].flatMap((outcome, index) => {
    const data = history({
      level,
      outcome: outcome === "unknown" ? "failed" : outcome,
      attemptId: `00000000-0000-4000-8000-${String(level * 10 + index).padStart(12, "0")}`,
      occurredAt: 1_700_000_000_000,
    });
    return outcome === "unknown" ? data.slice(0, -1) : data;
  }),
);
for (let i = 0; i < events.length; i += 40) {
  const response = await fetch("http://127.0.0.1:3001/api/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ events: events.slice(i, i + 40) }),
  });
  if (!response.ok)
    throw new Error(
      `Seed failed (${response.status}): ${await response.text()}`,
    );
  console.log(await response.json());
}
console.log(
  "12 sample attempts available at http://127.0.0.1:3001/api/dashboard?days=all. Period filters use server receipt time.",
);
