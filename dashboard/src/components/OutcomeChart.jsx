import React from "react";
import {
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatNumber, formatPercent } from "../formatters.js";
import { OUTCOMES } from "../labels.js";

function OutcomeTooltip({ active, payload }) {
  const summary = payload?.[0]?.payload;
  if (!active || !summary) return null;
  return (
    <div className="chart-tooltip" role="tooltip">
      <strong>Attempt outcomes</strong>
      <ul>
        {OUTCOMES.map(([key, label]) => (
          <li key={key}>
            {label}: {formatNumber(summary[key])} (
            {formatPercent(
              summary.attempts ? summary[key] / summary.attempts : 0,
            )}
            )
          </li>
        ))}
      </ul>
    </div>
  );
}

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
      <div className="outcome-chart">
        <ResponsiveContainer width="100%" height={40}>
          <BarChart
            data={[summary]}
            layout="vertical"
            margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
            accessibilityLayer
            aria-label={OUTCOMES.map(
              ([key, label]) => `${label}: ${summary[key]}`,
            ).join(", ")}
          >
            <XAxis
              type="number"
              domain={[0, Math.max(summary.attempts, 1)]}
              hide
            />
            <YAxis type="category" hide />
            <Tooltip
              content={<OutcomeTooltip />}
              cursor={false}
              isAnimationActive={false}
            />
            {OUTCOMES.map(([key, label]) => (
              <Bar
                key={key}
                dataKey={key}
                name={label}
                stackId="outcomes"
                fill={`var(--outcome-${key})`}
                barSize={24}
                isAnimationActive={false}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="legend">
        {OUTCOMES.map(([key, label]) => (
          <div key={key}>
            <span className={`swatch ${key}`} />
            <span>{label}</span>
            <strong>{formatNumber(summary[key])}</strong>
            <small>
              {formatPercent(
                summary.attempts ? summary[key] / summary.attempts : 0,
              )}
            </small>
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
