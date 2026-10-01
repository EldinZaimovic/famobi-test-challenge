import React from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { Dashboard } from "../src/Dashboard.jsx";
import { RecentAttemptsTable } from "../src/components/RecentAttemptsTable.jsx";
import { aggregate } from "../../backend/src/store.js";

const receivedAt = Date.UTC(2026, 8, 30, 12);
const attempt = {
  attemptId: "800e3e90-fd4b-4816-97de-b073f9200761",
  level: 1,
  outcome: "completed",
  progress: 1,
  fruitEaten: 5,
  target: 5,
  score: 50,
  levelScore: 50,
  durationMs: 16100,
  eventCount: 7,
  completeHistory: true,
  startObserved: true,
  endObserved: true,
  startedAt: receivedAt - 60_000,
  endedAt: receivedAt - 43_900,
  firstReceivedAt: receivedAt,
  lastReceivedAt: receivedAt + 1000,
  failureReason: null,
  leaveReason: null,
};
const failed = {
  ...attempt,
  attemptId: "c802d3c6-4760-4b76-9d2c-07074654667b",
  outcome: "failed",
  failureReason: "wall",
  levelScore: 0,
  progress: 0,
  fruitEaten: 0,
  durationMs: 1600,
  eventCount: 2,
};
const unknown = {
  ...failed,
  attemptId: "c802d3c6-4760-4b76-9d2c-07074654667c",
  outcome: "unknown",
  failureReason: null,
  endObserved: false,
  endedAt: null,
  completeHistory: false,
  eventCount: 1,
};
function dataset(attempts = [attempt, failed, unknown]) {
  return {
    generatedAt: receivedAt,
    truncated: false,
    summary: aggregate(attempts),
    levels: [1, 2, 3].map((level) => ({
      level,
      ...aggregate(attempts.filter((a) => a.level === level)),
    })),
    recentAttempts: attempts,
  };
}
const response = (data = dataset()) => ({ ok: true, json: async () => data });
function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
const ready = () => screen.findByRole("heading", { name: "Recent attempts" });

test("renders loading placeholders, sample counts and accessible charts", async () => {
  const pending = deferred();
  vi.stubGlobal(
    "fetch",
    vi.fn(() => pending.promise),
  );
  render(<Dashboard />);
  expect(
    screen.getByRole("status", { name: "Loading dashboard" }),
  ).toHaveAttribute("aria-busy", "true");
  await act(async () => pending.resolve(response()));
  const card = screen
    .getByRole("heading", { name: "Completion rate" })
    .closest("article");
  expect(within(card).getByText("50%")).toBeVisible();
  expect(
    within(card).getByText("1 of 2 ended attempts completed"),
  ).toBeVisible();
  expect(
    screen.getByRole("img", {
      name: "Completed: 1, Failed: 1, Left: 0, Unknown: 1",
    }),
  ).toBeVisible();
  expect(
    screen.getByRole("img", { name: "Level 2: no ended attempts" }),
  ).toBeVisible();
  expect(
    screen.queryByRole("status", { name: "Loading dashboard" }),
  ).not.toBeInTheDocument();
});

test("period, level and outcome controls request a new server-filtered cohort", async () => {
  const user = userEvent.setup();
  const fetcher = vi.fn(async () => response());
  vi.stubGlobal("fetch", fetcher);
  render(<Dashboard />);
  await ready();
  await user.selectOptions(screen.getByLabelText("Period"), "30");
  await user.selectOptions(screen.getByLabelText("Level"), "2");
  fetcher.mockResolvedValue(response(dataset([])));
  await user.selectOptions(screen.getByLabelText("Outcome"), "left");
  expect(fetcher.mock.lastCall[0]).toBe(
    "/api/dashboard?days=30&level=2&outcome=left",
  );
  expect(
    await screen.findByRole("heading", { name: "No attempts in this view." }),
  ).toBeVisible();
  expect(
    screen.queryByRole("heading", { name: "Recent attempts" }),
  ).not.toBeInTheDocument();
});

test("filter changes hide old numbers and discard late responses", async () => {
  const user = userEvent.setup();
  const oldRequest = deferred();
  const newRequest = deferred();
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(response())
    .mockImplementationOnce(() => oldRequest.promise)
    .mockImplementationOnce(() => newRequest.promise);
  vi.stubGlobal("fetch", fetcher);
  render(<Dashboard />);
  await ready();
  await user.selectOptions(screen.getByLabelText("Level"), "2");
  expect(
    screen.getByRole("status", { name: "Loading dashboard" }),
  ).toBeVisible();
  expect(screen.queryByText("50%")).not.toBeInTheDocument();
  await user.selectOptions(screen.getByLabelText("Level"), "3");
  expect(fetcher.mock.calls[1][1].signal.aborted).toBe(true);
  await act(async () => newRequest.resolve(response(dataset([]))));
  await act(async () => oldRequest.resolve(response()));
  expect(
    screen.getByRole("heading", { name: "No attempts in this view." }),
  ).toBeVisible();
  expect(
    screen.queryByRole("heading", { name: "Recent attempts" }),
  ).not.toBeInTheDocument();
});

test("background polling keeps the loaded layout and refresh label stable", async () => {
  vi.useFakeTimers();
  const pending = deferred();
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(response())
    .mockImplementationOnce(() => pending.promise);
  vi.stubGlobal("fetch", fetcher);
  render(<Dashboard />);
  await act(async () => {});
  const status = screen.getByText(/Last updated/).textContent;
  await act(async () => {
    await vi.advanceTimersByTimeAsync(5000);
  });
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(
    screen.getByRole("heading", { name: "Recent attempts" }),
  ).toBeVisible();
  expect(screen.getByRole("button", { name: "↻ Refresh" })).toBeEnabled();
  expect(screen.getByText(status)).toBeVisible();
  expect(
    screen.queryByRole("status", { name: "Loading dashboard" }),
  ).not.toBeInTheDocument();
  await act(async () =>
    pending.resolve(
      response({ ...dataset(), generatedAt: receivedAt + 60000 }),
    ),
  );
  expect(screen.queryByText(status)).not.toBeInTheDocument();
});

test("failed refresh keeps data visible and a user retry recovers", async () => {
  const user = userEvent.setup();
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(response())
    .mockResolvedValueOnce({ ok: false, status: 503 })
    .mockResolvedValue(response());
  vi.stubGlobal("fetch", fetcher);
  render(<Dashboard />);
  await ready();
  await user.click(screen.getByRole("button", { name: "↻ Refresh" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Showing the last successful result.",
  );
  expect(
    screen.getByRole("heading", { name: "Recent attempts" }),
  ).toBeVisible();
  await user.click(screen.getByRole("button", { name: "↻ Refresh" }));
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

test("keyboard expands an attempt with readable reasons, timestamps and copy feedback", async () => {
  const user = userEvent.setup();
  const copy = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
  const left = {
    ...attempt,
    outcome: "left",
    leaveReason: "page_exit",
    startObserved: false,
    startedAt: null,
    completeHistory: false,
  };
  render(<RecentAttemptsTable attempts={[left]} />);
  expect(screen.getByText("Page closed or left")).toBeVisible();
  const toggle = screen.getByRole("button", {
    name: /Show details for attempt/,
  });
  toggle.focus();
  await user.keyboard("{Enter}");
  expect(toggle).toHaveAttribute("aria-expanded", "true");
  expect(
    screen.getByText("Gameplay started").nextElementSibling,
  ).toHaveTextContent("Not recorded");
  expect(
    screen.getByText("Gameplay ended").nextElementSibling,
  ).toHaveTextContent(new Date(left.endedAt).toLocaleString());
  expect(
    screen.getByText("First received").nextElementSibling,
  ).toHaveTextContent(new Date(receivedAt).toLocaleString());
  expect(screen.getByText(/One or more expected events/)).toHaveTextContent(
    "This does not imply that the player failed or left.",
  );
  await user.click(screen.getByRole("button", { name: "Copy ID" }));
  expect(copy).toHaveBeenCalledWith(attempt.attemptId);
  expect(screen.getByRole("status")).toHaveTextContent("Attempt ID copied.");
  await user.click(toggle);
  expect(screen.queryByText("Full attempt ID")).not.toBeInTheDocument();
});

test("copy failure leaves the full ID available for manual copying", async () => {
  const user = userEvent.setup();
  vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(
    new Error("Denied"),
  );
  render(<RecentAttemptsTable attempts={[failed]} />);
  await user.click(screen.getByRole("button", { name: /Show details/ }));
  await user.click(screen.getByRole("button", { name: "Copy ID" }));
  expect(screen.getByRole("status")).toHaveTextContent("Could not copy.");
  expect(screen.getByText(failed.attemptId)).toBeVisible();
  expect(screen.getAllByText("Wall collision")).toHaveLength(2);
});

test("unknown-only cohorts show unmeasured completion and explain missing endings", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => response(dataset([unknown]))),
  );
  render(<Dashboard />);
  await ready();
  const card = screen
    .getByRole("heading", { name: "Completion rate" })
    .closest("article");
  expect(within(card).getByText("—")).toBeVisible();
  expect(
    within(card).getByText("0 of 0 ended attempts completed"),
  ).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: /Show details/ }));
  expect(screen.getByText(/No end event has arrived/)).toBeVisible();
});

test("initial request failure offers refresh without displaying fabricated metrics", async () => {
  const user = userEvent.setup();
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockRejectedValueOnce(new Error("Offline"))
      .mockResolvedValue(response()),
  );
  render(<Dashboard />);
  expect(await screen.findByRole("alert")).toHaveTextContent("Offline");
  expect(
    screen.queryByRole("heading", { name: "Completion rate" }),
  ).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "↻ Refresh" }));
  await ready();
});
