import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { pollDashboard } from "./pollDashboard.js";
import "./style.css";

const number = (value) =>
  value == null ? "—" : new Intl.NumberFormat().format(Math.round(value));
const percent = (value) =>
  value == null ? "—" : `${Math.round(value * 100)}%`;
const duration = (value) =>
  value == null ? "—" : `${(value / 1000).toFixed(1)}s`;
const outcomes = [
  ["completed", "Completed"],
  ["failed", "Failed"],
  ["left", "Left"],
  ["unknown", "Unknown"],
];

function App() {
  const [days, setDays] = useState("7");
  const [level, setLevel] = useState("");
  const [{ data, error, loading }, setState] = useState({
    data: null,
    error: "",
    loading: true,
  });
  const poller = useRef(null);
  useEffect(() => {
    setState({ data: null, error: "", loading: true });
    const query = new URLSearchParams({ days, ...(level ? { level } : {}) });
    const current = pollDashboard(query, (change) =>
      setState((previous) => ({ ...previous, ...change })),
    );
    poller.current = current;
    return () => current.stop();
  }, [days, level]);
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
            NEON SNAKE<small>GAME INTELLIGENCE</small>
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
      <main id="overview">
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
              : loading
                ? "Syncing data"
                : "Live · updates every 5s"}
          </span>
        </section>
        <section className="toolbar" aria-label="Dashboard filters">
          <div className="filters">
            <label>
              Period
              <select value={days} onChange={(e) => setDays(e.target.value)}>
                <option value="1">Last 24 hours</option>
                <option value="7">Last 7 days</option>
                <option value="30">Last 30 days</option>
                <option value="all">All time</option>
              </select>
            </label>
            <label>
              Level
              <select value={level} onChange={(e) => setLevel(e.target.value)}>
                <option value="">All levels</option>
                {[1, 2, 3].map((n) => (
                  <option key={n} value={n}>
                    Level {n}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <button onClick={() => poller.current?.refresh()} disabled={loading}>
            {loading ? "Syncing…" : "↻ Refresh"}
          </button>
        </section>
        {error && (
          <div className="notice error" role="alert">
            {error}
            {data && " Showing the last successful result."}
          </div>
        )}
        {data?.truncated && (
          <div className="notice" role="status">
            Sample limit reached. Showing the newest 5,000 attempts in this
            period before the level filter. Narrow the period for more precise
            results.
          </div>
        )}
        {!data && !error && (
          <div className="empty" role="status">
            Loading gameplay data…
          </div>
        )}
        {data && (
          <>
            <section className="metrics" aria-label="Key metrics">
              <Metric
                title="Total attempts"
                value={number(summary.attempts)}
                note={`${number(summary.events)} events received`}
                accent
              />
              <Metric
                title="Completion rate"
                value={percent(summary.completionRate)}
                note="Completed / all ended attempts"
              />
              <Metric
                title="Average duration"
                value={duration(summary.averageDurationMs)}
                note="Ended attempts · includes pauses"
              />
              <Metric
                title="Average level score"
                value={number(summary.averageLevelScore)}
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
                      : `${number(summary.completed)} of ${number(summary.attempts - summary.unknown)} ended attempts completed their level.`}
                  </strong>{" "}
                  {summary.attempts > summary.unknown &&
                    `${number(summary.failed)} ended in failure; ${number(summary.left)} left early.`}
                  {summary.unknown > 0 &&
                    ` ${number(summary.unknown)} ${summary.unknown === 1 ? "attempt has" : "attempts have"} an unknown outcome and ${summary.unknown === 1 ? "is" : "are"} excluded from completion rate, average duration, and average score.`}
                </p>
              </section>
            )}
            {summary.attempts === 0 ? (
              <section className="empty">
                <span className="empty-icon">↗</span>
                <h2>No attempts in this view.</h2>
                <p>
                  Try a wider period or another level, or play a round of Neon
                  Snake.
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
                  <section className="panel">
                    <div className="panel-title">
                      <h2>Attempt outcomes</h2>
                      <span>01 / DISTRIBUTION</span>
                    </div>
                    <p className="chart-description">
                      How does each attempt end?
                    </p>
                    <div className="outcome-total">
                      {number(summary.attempts)}
                      <span>recorded attempts</span>
                    </div>
                    <div
                      className="stack"
                      role="img"
                      aria-label={outcomes
                        .map(([key, label]) => `${label}: ${summary[key]}`)
                        .join(", ")}
                    >
                      {outcomes
                        .filter(([key]) => summary[key] > 0)
                        .map(([key, label]) => (
                          <div
                            key={key}
                            className={key}
                            title={`${label}: ${number(summary[key])} (${percent(summary[key] / summary.attempts)})`}
                            style={{
                              flex: summary[key],
                            }}
                          />
                        ))}
                    </div>
                    <div className="legend">
                      {outcomes.map(([key, label]) => (
                        <div key={key}>
                          <span className={`swatch ${key}`} />
                          <span>{label}</span>
                          <strong>{number(summary[key])}</strong>
                          <small>
                            {percent(summary[key] / summary.attempts)}
                          </small>
                        </div>
                      ))}
                    </div>
                    <p className="panel-footnote">
                      Share of all attempts. Unknown means no end event
                      received; the attempt may still be active or its end event
                      may be missing.
                    </p>
                  </section>
                  <section className="panel">
                    <div className="panel-title">
                      <h2>Level performance</h2>
                      <span>02 / COMPLETION</span>
                    </div>
                    <p className="chart-description">
                      Where do attempts struggle to finish?
                    </p>
                    <div className="level-chart">
                      {data.levels.map((row) => (
                        <div className="level-row" key={row.level}>
                          <div>
                            <strong>
                              Level {String(row.level).padStart(2, "0")}
                            </strong>
                            <span>
                              {number(row.completed)} /{" "}
                              {number(row.attempts - row.unknown)} ended ·{" "}
                              {number(row.unknown)} unknown
                            </span>
                            <b>{percent(row.completionRate)}</b>
                          </div>
                          <div
                            className={`track ${row.completionRate == null ? "no-data" : ""}`}
                            role="img"
                            aria-label={`Level ${row.level}: ${row.completionRate == null ? "no ended attempts" : `${percent(row.completionRate)} completed; ${row.completed} of ${row.attempts - row.unknown} ended attempts`}`}
                          >
                            <div
                              style={{
                                width: `${(row.completionRate ?? 0) * 100}%`,
                              }}
                            />
                          </div>
                          {row.completionRate == null && (
                            <small className="no-data-label">
                              No ended attempts
                            </small>
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
                      Completed / ended attempts per level. Small samples can
                      vary widely; these are attempts, not unique players or a
                      retention funnel.
                    </p>
                  </section>
                </div>
                <section className="panel activity">
                  <div className="panel-title">
                    <div>
                      <h2>Recent attempts</h2>
                      <p>
                        The latest {data.recentAttempts.length} in this view,
                        newest first.
                      </p>
                    </div>
                    <span>03 / ACTIVITY</span>
                  </div>
                  <div
                    className="table-wrap"
                    tabIndex={0}
                    role="region"
                    aria-label="Recent attempts, scroll horizontally on small screens"
                  >
                    <table>
                      <caption className="sr-only">
                        Latest attempts ordered by first server receipt, newest
                        first
                      </caption>
                      <thead>
                        <tr>
                          <th>Attempt / received</th>
                          <th>Level</th>
                          <th>Outcome</th>
                          <th>Progress</th>
                          <th>Level score</th>
                          <th>Duration</th>
                          <th>History</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.recentAttempts.map((attempt) => (
                          <tr key={attempt.attemptId}>
                            <td>
                              <code title={attempt.attemptId}>
                                {attempt.attemptId.slice(0, 4)}…
                                {attempt.attemptId.slice(-6)}
                              </code>
                              <small>
                                {new Date(
                                  attempt.firstReceivedAt,
                                ).toLocaleString()}
                              </small>
                            </td>
                            <td>{String(attempt.level).padStart(2, "0")}</td>
                            <td>
                              <span className={`badge ${attempt.outcome}`}>
                                {attempt.outcome}
                              </span>
                              {(attempt.failureReason ||
                                attempt.leaveReason) && (
                                <small>
                                  {attempt.failureReason || attempt.leaveReason}
                                </small>
                              )}
                            </td>
                            <td>
                              {attempt.fruitEaten}/{attempt.target}
                              <small>{percent(attempt.progress)}</small>
                            </td>
                            <td>{number(attempt.levelScore)}</td>
                            <td>
                              {duration(attempt.durationMs)}
                              {!attempt.endObserved && (
                                <small>last observed</small>
                              )}
                            </td>
                            <td>
                              <span
                                className={
                                  attempt.completeHistory
                                    ? "history-complete"
                                    : "muted"
                                }
                              >
                                {attempt.completeHistory
                                  ? "Complete"
                                  : "Partial"}
                              </span>
                              <small>{attempt.eventCount} events</small>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              </>
            )}
            <footer>
              <span className={error ? "offline" : ""}>
                <span className="online-dot" />{" "}
                {error ? "Showing saved result" : "Firestore emulator"} ·{" "}
                {summary.incompleteHistories} partial histories
              </span>
              <span>
                Updated {new Date(data.generatedAt).toLocaleTimeString()} ·
                Period uses first server receipt
              </span>
            </footer>
          </>
        )}
      </main>
    </div>
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
createRoot(document.getElementById("root")).render(<App />);
