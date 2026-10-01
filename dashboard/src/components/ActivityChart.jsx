import React, { useId } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatNumber } from "../formatters.js";

function formatBucketTime(timestamp, intervalMs, detailed = false) {
  return new Date(timestamp).toLocaleString(undefined, {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    ...(intervalMs < 86400_000
      ? { hour: "2-digit", minute: "2-digit", hour12: false }
      : {}),
    ...(detailed ? { year: "numeric" } : {}),
  });
}

function ActivityTooltip({ active, payload, intervalMs }) {
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;
  return (
    <div className="chart-tooltip" role="tooltip">
      <strong>{formatBucketTime(row.receivedAt, intervalMs, true)} UTC</strong>
      <p>{formatNumber(row.attempts)} recorded attempts</p>
      <p>{formatNumber(row.completed)} completed</p>
    </div>
  );
}

export function ActivityChart({ activity }) {
  const gradientId = useId();
  const { buckets, intervalMs } = activity;
  const interval =
    intervalMs < 86400_000
      ? "Hourly"
      : intervalMs === 86400_000
        ? "Daily"
        : `${intervalMs / 86400_000}-day`;
  return (
    <section className="panel">
      <div className="panel-title">
        <h2>Attempt activity</h2>
        <span>03 / OVER TIME</span>
      </div>
      <p className="chart-description">
        When are attempts recorded, and how many finish?
      </p>
      <div className="chart-key">
        <span>
          <i className="swatch activity-swatch" /> All attempts
        </span>
        <span>
          <i className="swatch completed" /> Completed
        </span>
        <small>{interval} · UTC</small>
      </div>
      <ResponsiveContainer width="100%" height={240}>
        <AreaChart
          data={buckets}
          margin={{ top: 12, right: 14, bottom: 0, left: 0 }}
          accessibilityLayer
          aria-label="Attempt activity over time; all attempts and completed attempts"
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#83cfe5" stopOpacity={0.45} />
              <stop offset="100%" stopColor="#83cfe5" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid
            stroke="#2c393d"
            strokeDasharray="3 5"
            vertical={false}
          />
          <XAxis
            dataKey="receivedAt"
            tickFormatter={(value) => formatBucketTime(value, intervalMs)}
            tick={{ fill: "#a1b2b8", fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            minTickGap={30}
            interval="preserveStartEnd"
          />
          <YAxis
            allowDecimals={false}
            domain={[0, (max) => Math.max(1, max)]}
            width={36}
            tick={{ fill: "#a1b2b8", fontSize: 12 }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            content={<ActivityTooltip intervalMs={intervalMs} />}
            isAnimationActive={false}
          />
          <Area
            type="linear"
            dataKey="attempts"
            name="All attempts"
            stroke="#83cfe5"
            strokeWidth={2}
            fill={`url(#${gradientId})`}
            dot={{ r: 3 }}
            activeDot={{ r: 5 }}
            isAnimationActive={false}
          />
          <Area
            type="linear"
            dataKey="completed"
            name="Completed"
            stroke="#b9ed83"
            strokeWidth={2}
            strokeDasharray="5 4"
            fill="transparent"
            dot={{ r: 2 }}
            activeDot={{ r: 4 }}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
      <details className="chart-data">
        <summary>View activity data</summary>
        <div
          className="chart-data-scroll"
          tabIndex={0}
          role="region"
          aria-label="Activity data, scroll to see all intervals"
        >
          <table>
            <caption className="sr-only">
              Attempt counts by UTC interval start
            </caption>
            <thead>
              <tr>
                <th>Interval start (UTC)</th>
                <th>Attempts</th>
                <th>Completed</th>
              </tr>
            </thead>
            <tbody>
              {buckets.map((row) => (
                <tr key={row.receivedAt}>
                  <th scope="row">
                    {formatBucketTime(row.receivedAt, intervalMs, true)}
                  </th>
                  <td>{formatNumber(row.attempts)}</td>
                  <td>{formatNumber(row.completed)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
      <p className="panel-footnote">
        {interval} counts by first server receipt. Completed attempts are part
        of the total, not an additional series to add. Boundary intervals may be
        partial; late completions update the original interval.
      </p>
    </section>
  );
}
