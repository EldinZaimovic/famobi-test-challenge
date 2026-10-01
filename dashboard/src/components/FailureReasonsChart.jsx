import React from "react";
import { Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { formatNumber, formatPercent } from "../formatters.js";
import { formatReason } from "../labels.js";

const REASON_COLORS = {
  wall: "#e9a397",
  snake: "#c0a2ed",
  obstacle: "#d4ba7b",
  external: "#83cfe5",
  unrecorded: "#8193a5",
};

function FailureTooltip({ active, payload, total }) {
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;
  return (
    <div className="chart-tooltip" role="tooltip">
      <strong>{row.label}</strong>
      <p>
        {formatNumber(row.count)} {row.count === 1 ? "failure" : "failures"} ·{" "}
        {formatPercent(row.count / total)}
      </p>
    </div>
  );
}

export function FailureReasonsChart({ failureReasons }) {
  const total = failureReasons.reduce((sum, row) => sum + row.count, 0);
  const data = failureReasons.map((row) => ({
    ...row,
    label:
      row.reason === "unrecorded"
        ? "Reason not recorded"
        : formatReason(row.reason),
    fill: REASON_COLORS[row.reason] ?? REASON_COLORS.unrecorded,
  }));
  return (
    <section className="panel">
      <div className="panel-title">
        <h2>Failure causes</h2>
        <span>04 / DIAGNOSTICS</span>
      </div>
      <p className="chart-description">
        What brings unsuccessful attempts to an end?
      </p>
      {total === 0 ? (
        <div className="chart-empty">
          <span aria-hidden="true">◎</span>
          <strong>No recorded failures</strong>
          <p>This view has no failed attempts to break down.</p>
        </div>
      ) : (
        <>
          <div className="failure-donut">
            <ResponsiveContainer width="100%" height={220}>
              <PieChart
                accessibilityLayer
                aria-label="Failure causes; use arrow keys to explore each cause"
              >
                <Pie
                  data={data}
                  dataKey="count"
                  nameKey="label"
                  innerRadius={64}
                  outerRadius={90}
                  paddingAngle={data.length > 1 ? 4 : 0}
                  stroke="#172226"
                  strokeWidth={3}
                  isAnimationActive={false}
                />
                <Tooltip
                  content={<FailureTooltip total={total} />}
                  isAnimationActive={false}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="donut-total" aria-hidden="true">
              <strong>{formatNumber(total)}</strong>
              <span>{total === 1 ? "failure" : "failures"}</span>
            </div>
          </div>
          <div className="legend">
            {data.map((row) => (
              <div key={row.reason}>
                <span className="swatch" style={{ background: row.fill }} />
                <span>{row.label}</span>
                <strong>{formatNumber(row.count)}</strong>
                <small>{formatPercent(row.count / total)}</small>
              </div>
            ))}
          </div>
        </>
      )}
      <p className="panel-footnote">
        Share of {formatNumber(total)} recorded{" "}
        {total === 1 ? "failure" : "failures"} in this view. Completed, left,
        and unknown attempts are excluded; missing end events are never treated
        as failures.
      </p>
    </section>
  );
}
