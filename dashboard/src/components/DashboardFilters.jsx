import React from "react";
import { OUTCOMES } from "../labels.js";

export function DashboardFilters({ filters, onChange, onRefresh, disabled }) {
  const update = (key) => (event) =>
    onChange({ ...filters, [key]: event.target.value });
  return (
    <section className="toolbar" aria-label="Dashboard filters">
      <div className="filters">
        <label>
          Period
          <select value={filters.days} onChange={update("days")}>
            <option value="1">Last 24 hours</option>
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="all">All time</option>
          </select>
        </label>
        <label>
          Level
          <select value={filters.level} onChange={update("level")}>
            <option value="">All levels</option>
            {[1, 2, 3].map((level) => (
              <option key={level} value={level}>
                Level {level}
              </option>
            ))}
          </select>
        </label>
        <label>
          Outcome
          <select value={filters.outcome} onChange={update("outcome")}>
            <option value="">All outcomes</option>
            {OUTCOMES.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <button onClick={onRefresh} disabled={disabled}>
        ↻ Refresh
      </button>
      <p className="filter-note">
        Filters apply to all metrics, charts, and attempts.
        {filters.outcome && " Completion rate uses only the selected outcome."}
      </p>
    </section>
  );
}
