import React from "react";
import { formatNumber, formatPercent } from "../formatters.js";

export function LevelPerformanceChart({ levels }) {
  return (
    <section className="panel">
      <div className="panel-title">
        <h2>Level performance</h2>
        <span>02 / COMPLETION</span>
      </div>
      <p className="chart-description">Where do attempts struggle to finish?</p>
      <div className="level-chart">
        {levels.map((row) => (
          <div className="level-row" key={row.level}>
            <div>
              <strong>Level {String(row.level).padStart(2, "0")}</strong>
              <span>
                {formatNumber(row.completed)} /{" "}
                {formatNumber(row.attempts - row.unknown)} ended ·{" "}
                {formatNumber(row.unknown)} unknown
              </span>
              <b>{formatPercent(row.completionRate)}</b>
            </div>
            <div
              className={`track ${row.completionRate == null ? "no-data" : ""}`}
              role="img"
              aria-label={`Level ${row.level}: ${row.completionRate == null ? "no ended attempts" : `${formatPercent(row.completionRate)} completed; ${row.completed} of ${row.attempts - row.unknown} ended attempts`}`}
            >
              <div
                style={{
                  width: `${(row.completionRate ?? 0) * 100}%`,
                }}
              />
            </div>
            {row.completionRate == null && (
              <small className="no-data-label">No ended attempts</small>
            )}
          </div>
        ))}
        <div className="chart-axis" aria-hidden="true">
          <span>0%</span>
          <span>50%</span>
          <span>100%</span>
        </div>
      </div>
      <p className="panel-footnote">
        Completed / ended attempts per level. Small samples can vary widely;
        these are attempts, not unique players or a retention funnel.
      </p>
    </section>
  );
}
