import React, { useId } from "react";
import {
  Bar,
  BarChart,
  Rectangle,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatNumber, formatPercent } from "../formatters.js";

function getCompletionBarValue(row) {
  // A zero-width shape lets Recharts draw the patterned background for null.
  // Keep the original null in the data for labels and tooltips.
  return row.completionRate ?? 0;
}

function CompletionAxisTick({ x, y, payload }) {
  return (
    <text
      x={x}
      y={y}
      dy={14}
      textAnchor={
        payload.value === 0 ? "start" : payload.value === 1 ? "end" : "middle"
      }
      fill="#a1b2b8"
      fontSize={12}
    >
      {formatPercent(payload.value)}
    </text>
  );
}

function LevelTooltip({ active, payload }) {
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;
  return (
    <div className="chart-tooltip" role="tooltip">
      <strong>Level {String(row.level).padStart(2, "0")}</strong>
      <p>
        {row.completionRate == null
          ? "No ended attempts"
          : `${formatPercent(row.completionRate)} completed`}
      </p>
      <p>
        {formatNumber(row.completed)} of{" "}
        {formatNumber(row.attempts - row.unknown)} ended attempts completed
      </p>
      <p>{formatNumber(row.unknown)} unknown</p>
    </div>
  );
}

export function LevelPerformanceChart({ levels }) {
  const patternId = useId();
  return (
    <section className="panel">
      <div className="panel-title">
        <h2>Level performance</h2>
        <span>02 / COMPLETION</span>
      </div>
      <p className="chart-description">Where do attempts struggle to finish?</p>
      <div className="level-chart">
        {levels.map((row, index) => (
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
            <div className="level-bar-chart">
              <ResponsiveContainer
                width="100%"
                height={index === levels.length - 1 ? 54 : 28}
              >
                <BarChart
                  data={[row]}
                  layout="vertical"
                  margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
                  accessibilityLayer
                  aria-label={`Level ${row.level}: ${row.completionRate == null ? "no ended attempts" : `${formatPercent(row.completionRate)} completed; ${row.completed} of ${row.attempts - row.unknown} ended attempts`}`}
                >
                  <defs>
                    <pattern
                      id={`${patternId}-${row.level}`}
                      width="8"
                      height="8"
                      patternUnits="userSpaceOnUse"
                      patternTransform="rotate(45)"
                    >
                      <rect width="8" height="8" fill="#29373b" />
                      <rect width="4" height="8" fill="#172226" />
                    </pattern>
                  </defs>
                  <XAxis
                    type="number"
                    domain={[0, 1]}
                    ticks={[0, 0.5, 1]}
                    tick={<CompletionAxisTick />}
                    interval={0}
                    axisLine={false}
                    tickLine={false}
                    height={26}
                    hide={index !== levels.length - 1}
                  />
                  <YAxis type="category" hide />
                  <Tooltip
                    content={<LevelTooltip />}
                    filterNull={false}
                    cursor={false}
                    isAnimationActive={false}
                  />
                  <Bar
                    dataKey={getCompletionBarValue}
                    name="Completion rate"
                    fill="var(--outcome-completed)"
                    barSize={14}
                    radius={2}
                    // Preserve zero-width entries so their backgrounds still render.
                    shape={<Rectangle />}
                    background={{
                      fill:
                        row.completionRate == null
                          ? `url(#${patternId}-${row.level})`
                          : "#29373b",
                      radius: 2,
                    }}
                    isAnimationActive={false}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
            {row.completionRate == null && (
              <small className="no-data-label">No ended attempts</small>
            )}
          </div>
        ))}
      </div>
      <p className="panel-footnote">
        Completed / ended attempts per level. Small samples can vary widely;
        these are attempts, not unique players or a retention funnel.
      </p>
    </section>
  );
}
