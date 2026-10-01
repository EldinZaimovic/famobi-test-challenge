import React from "react";

export function DashboardSkeleton() {
  return (
    <section
      className="dashboard-skeleton"
      role="status"
      aria-label="Loading dashboard"
      aria-busy="true"
    >
      <span className="sr-only">Loading gameplay data…</span>
      <div aria-hidden="true">
        <div className="metrics">
          {[0, 1, 2, 3].map((key) => (
            <div className="metric" key={key}>
              <div className="skeleton-line" />
              <div className="skeleton-value" />
              <div className="skeleton-line" />
            </div>
          ))}
        </div>
        <div className="overview-note">
          <div className="skeleton-line" />
        </div>
        <div className="charts">
          {[0, 1, 2, 3].map((key) => (
            <div className="panel skeleton-chart" key={key}>
              <div className="skeleton-line" />
              <div className="skeleton-line" />
              <div className="skeleton-value" />
            </div>
          ))}
        </div>
        <div className="panel skeleton-table">
          <div className="skeleton-line" />
          <div className="skeleton-line" />
        </div>
      </div>
    </section>
  );
}
