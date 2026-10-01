import React from "react";
import { formatNumber, formatPercent, formatDuration } from "../formatters.js";

export function MetricsOverview({ summary }) {
  return (
    <>
      <section className="metrics" aria-label="Key metrics">
        <Metric
          title="Total attempts"
          value={formatNumber(summary.attempts)}
          note={`${formatNumber(summary.events)} events received`}
          accent
        />
        <Metric
          title="Completion rate"
          value={formatPercent(summary.completionRate)}
          note={`${formatNumber(summary.completed)} of ${formatNumber(summary.attempts - summary.unknown)} ended attempts completed`}
        />
        <Metric
          title="Average duration"
          value={formatDuration(summary.averageDurationMs)}
          note="Ended attempts · includes pauses"
        />
        <Metric
          title="Average level score"
          value={formatNumber(summary.averageLevelScore)}
          note="Ended attempts · level-only points"
        />
      </section>
      {summary.attempts > 0 && (
        <section className="overview-note" aria-label="Gameplay summary">
          <span className="eyebrow">AT A GLANCE</span>
          <p>
            <strong>
              {summary.attempts === summary.unknown
                ? "No attempts have an end event yet."
                : `${formatNumber(summary.completed)} of ${formatNumber(summary.attempts - summary.unknown)} ended attempts completed their level.`}
            </strong>{" "}
            {summary.attempts > summary.unknown &&
              `${formatNumber(summary.failed)} ended in failure; ${formatNumber(summary.left)} left early.`}
            {summary.unknown > 0 &&
              ` ${formatNumber(summary.unknown)} ${summary.unknown === 1 ? "attempt has" : "attempts have"} an unknown outcome and ${summary.unknown === 1 ? "is" : "are"} excluded from completion rate, average duration, and average score.`}
          </p>
        </section>
      )}
    </>
  );
}
function Metric({ title, value, note, accent }) {
  return (
    <article className={`metric ${accent ? "accent" : ""}`}>
      <h2>{title}</h2>
      <strong>{value}</strong>
      <p>{note}</p>
    </article>
  );
}
