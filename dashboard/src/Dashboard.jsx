import React, { useState } from "react";
import { useDashboard } from "./useDashboard.js";
import { DashboardFilters } from "./components/DashboardFilters.jsx";
import { MetricsOverview } from "./components/MetricsOverview.jsx";
import { OutcomeChart } from "./components/OutcomeChart.jsx";
import { LevelPerformanceChart } from "./components/LevelPerformanceChart.jsx";
import { RecentAttemptsTable } from "./components/RecentAttemptsTable.jsx";
import { DashboardSkeleton } from "./components/DashboardSkeleton.jsx";

export function Dashboard() {
  const [filters, setFilters] = useState({ days: "7", level: "", outcome: "" });
  const { data, error, loading, refresh, queryKey } = useDashboard(filters);
  const summary = data?.summary;
  return (
    <div className="app">
      <a className="skip-link" href="#overview">
        Skip to dashboard
      </a>
      <aside>
        <a className="brand" href="/">
          <span className="logo">N</span>
          <span>
            NEON SNAKE<small>DASHBOARD</small>
          </span>
        </a>
        <div className="nav-label">WORKSPACE</div>
        <div className="nav-active">
          <span aria-hidden="true">▥</span> Gameplay overview{" "}
          <span className="nav-dot" />
        </div>
        <div className="sidebar-note">
          <span className="online-dot" /> LOCAL ENVIRONMENT
          <p>Firebase Emulator Suite</p>
          <small>Your gameplay data stays on this machine.</small>
        </div>
        <a
          className="launch"
          href="http://127.0.0.1:5174"
          target="_blank"
          rel="noreferrer"
        >
          Launch game <span>↗</span>
        </a>
      </aside>
      <main id="overview" tabIndex={-1}>
        <header>
          <span>
            ANALYTICS <span className="slash">/</span> OVERVIEW
          </span>
          <a href="http://127.0.0.1:4000" target="_blank" rel="noreferrer">
            Open Firebase emulator ↗
          </a>
        </header>
        <section className="page-heading">
          <div>
            <div className="eyebrow">EVERY ATTEMPT TELLS A STORY</div>
            <h1>
              Gameplay overview<span>.</span>
            </h1>
            <p>
              Understand attempt outcomes, level difficulty, and time spent
              playing.
            </p>
          </div>
          <span className={`live ${error ? "offline" : ""}`}>
            <span className="online-dot" />
            {error
              ? "Connection interrupted"
              : data
                ? `Last updated ${new Date(data.generatedAt).toLocaleTimeString()}`
                : "Loading gameplay data…"}
          </span>
        </section>

        <DashboardFilters
          filters={filters}
          onChange={setFilters}
          onRefresh={refresh}
          disabled={!data && loading}
        />
        {error && (
          <div className="notice error" role="alert">
            {error}
            {data && " Showing the last successful result."}
          </div>
        )}
        {data?.truncated && (
          <div className="notice" role="status">
            Sample limit reached. Showing the newest 5,000 attempts in this
            period before level and outcome filters. Narrow the period for more
            precise results.
          </div>
        )}
        {!data && loading && <DashboardSkeleton />}
        {data && (
          <>
            <MetricsOverview summary={summary} />
            {summary.attempts === 0 ? (
              <section className="empty">
                <span className="empty-icon">↗</span>
                <h2>No attempts in this view.</h2>
                <p>
                  Try a wider period or different filters, or play a round of
                  Neon Snake.
                </p>
                <a
                  className="primary"
                  href="http://127.0.0.1:5174"
                  target="_blank"
                  rel="noreferrer"
                >
                  Launch game ↗
                </a>
                <p className="fine-print">
                  New gameplay events appear here automatically.
                </p>
              </section>
            ) : (
              <>
                <div className="charts">
                  <OutcomeChart summary={summary} />
                  <LevelPerformanceChart levels={data.levels} />
                </div>
                <RecentAttemptsTable
                  key={queryKey}
                  attempts={data.recentAttempts}
                />
              </>
            )}
            <footer>
              <span className={error ? "offline" : ""}>
                <span className="online-dot" />
                {error
                  ? "Showing last successful result"
                  : "Firestore emulator"}{" "}
                · {summary.incompleteHistories} partial histories
              </span>
              <span>
                Refreshes automatically · Period uses first server receipt
              </span>
            </footer>
          </>
        )}
      </main>
    </div>
  );
}
