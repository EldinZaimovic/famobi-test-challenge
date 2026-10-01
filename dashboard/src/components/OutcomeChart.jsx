import React from "react";
import { formatNumber, formatPercent } from "../formatters.js";
import { OUTCOMES } from "../labels.js";

export function OutcomeChart({ summary }) {
  return (
    <section className="panel">
      <div className="panel-title">
        <h2>Attempt outcomes</h2>
        <span>01 / DISTRIBUTION</span>
      </div>
      <p className="chart-description">How does each attempt end?</p>
      <div className="outcome-total">
        {formatNumber(summary.attempts)}
        <span>recorded attempts</span>
      </div>
      <div
        className="stack"
        role="img"
        aria-label={OUTCOMES.map(
          ([key, label]) => `${label}: ${summary[key]}`,
        ).join(", ")}
      >
        {OUTCOMES.filter(([key]) => summary[key] > 0).map(([key, label]) => (
          <div
            key={key}
            className={key}
            title={`${label}: ${formatNumber(summary[key])} (${formatPercent(summary[key] / summary.attempts)})`}
            style={{
              flex: summary[key],
            }}
          />
        ))}
      </div>
      <div className="legend">
        {OUTCOMES.map(([key, label]) => (
          <div key={key}>
            <span className={`swatch ${key}`} />
            <span>{label}</span>
            <strong>{formatNumber(summary[key])}</strong>
            <small>{formatPercent(summary[key] / summary.attempts)}</small>
          </div>
        ))}
      </div>
      <p className="panel-footnote">
        Share of all attempts. Unknown means no end event received; the attempt
        may still be active or its end event may be missing.
      </p>
    </section>
  );
}
