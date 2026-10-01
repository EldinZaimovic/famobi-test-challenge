import React, { useState } from "react";
import {
  formatNumber,
  formatPercent,
  formatDuration,
  formatTimestamp,
} from "../formatters.js";
import { formatReason } from "../labels.js";

function AttemptDetails({ attempt }) {
  const [copyStatus, setCopyStatus] = useState("");
  async function copyId() {
    try {
      await navigator.clipboard.writeText(attempt.attemptId);
      setCopyStatus("Attempt ID copied.");
    } catch {
      setCopyStatus("Could not copy. Select and copy the full ID below.");
    }
  }
  const reason = attempt.failureReason || attempt.leaveReason;
  return (
    <div className="attempt-details">
      <div className="attempt-id">
        <strong>Full attempt ID</strong>
        <code>{attempt.attemptId}</code>
        <button onClick={copyId}>Copy ID</button>
        <span role="status">{copyStatus}</span>
      </div>
      <dl>
        <div>
          <dt>Gameplay started</dt>
          <dd>{formatTimestamp(attempt.startedAt)}</dd>
        </div>
        <div>
          <dt>Gameplay ended</dt>
          <dd>{formatTimestamp(attempt.endedAt)}</dd>
        </div>
        <div>
          <dt>First received</dt>
          <dd>{formatTimestamp(attempt.firstReceivedAt)}</dd>
        </div>
        <div>
          <dt>Last received</dt>
          <dd>{formatTimestamp(attempt.lastReceivedAt)}</dd>
        </div>
        <div>
          <dt>Reason</dt>
          <dd>
            {reason
              ? formatReason(reason)
              : attempt.outcome === "completed"
                ? "Level completed"
                : attempt.outcome === "unknown"
                  ? "No end event received"
                  : "Not recorded"}
          </dd>
        </div>
      </dl>
      <p>
        Gameplay times come from the player's device; receipt times come from
        the server. Times are shown in your browser's local time zone.
      </p>
      <p>
        <strong>
          {attempt.completeHistory ? "Complete history." : "Partial history."}
        </strong>{" "}
        {attempt.completeHistory
          ? "The start, progress, and end events for this attempt were all received."
          : "One or more expected events have not been received. This does not imply that the player failed or left."}
        {!attempt.startObserved && " The start event is missing."}
        {!attempt.endObserved &&
          " No end event has arrived; this attempt may still be active or its end event may be missing."}
      </p>
    </div>
  );
}

function AttemptRow({ attempt }) {
  const [expanded, setExpanded] = useState(false);
  const detailId = `attempt-${attempt.attemptId}`;
  const reason = attempt.failureReason || attempt.leaveReason;
  return (
    <>
      <tr>
        <td>
          <button
            className="attempt-toggle"
            aria-expanded={expanded}
            aria-controls={detailId}
            aria-label={`${expanded ? "Hide" : "Show"} details for attempt ${attempt.attemptId}`}
            onClick={() => setExpanded(!expanded)}
          >
            <span aria-hidden="true">{expanded ? "▾" : "▸"}</span>{" "}
            <code>
              {attempt.attemptId.slice(0, 4)}…{attempt.attemptId.slice(-6)}
            </code>
          </button>
          <small>{formatTimestamp(attempt.firstReceivedAt)}</small>
        </td>
        <td>{String(attempt.level).padStart(2, "0")}</td>
        <td>
          <span className={`badge ${attempt.outcome}`}>{attempt.outcome}</span>
          {reason && <small>{formatReason(reason)}</small>}
        </td>
        <td>
          {attempt.fruitEaten}/{attempt.target}
          <small>{formatPercent(attempt.progress)}</small>
        </td>
        <td>{formatNumber(attempt.levelScore)}</td>
        <td>
          {formatDuration(attempt.durationMs)}
          {!attempt.endObserved && <small>last observed</small>}
        </td>
        <td>
          <span
            className={attempt.completeHistory ? "history-complete" : "muted"}
          >
            {attempt.completeHistory ? "Complete" : "Partial"}
          </span>
          <small>{attempt.eventCount} events</small>
        </td>
      </tr>
      <tr id={detailId} hidden={!expanded} className="attempt-detail-row">
        <td colSpan={7}>{expanded && <AttemptDetails attempt={attempt} />}</td>
      </tr>
    </>
  );
}

export function RecentAttemptsTable({ attempts }) {
  return (
    <section className="panel activity" aria-labelledby="attempts-heading">
      <div className="panel-title">
        <div>
          <h2 id="attempts-heading">Recent attempts</h2>
          <p>
            The latest {attempts.length} in this view, newest first. Expand an
            attempt for details.
          </p>
        </div>
        <span>05 / ACTIVITY</span>
      </div>
      <div
        className="table-wrap"
        tabIndex={0}
        role="region"
        aria-label="Recent attempts, scroll horizontally on small screens"
      >
        <table>
          <caption className="sr-only">
            Latest attempts ordered by first server receipt, newest first
          </caption>
          <thead>
            <tr>
              {[
                "Attempt / received",
                "Level",
                "Outcome",
                "Progress",
                "Level score",
                "Duration",
                "History",
              ].map((heading) => (
                <th scope="col" key={heading}>
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {attempts.map((attempt) => (
              <AttemptRow key={attempt.attemptId} attempt={attempt} />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
