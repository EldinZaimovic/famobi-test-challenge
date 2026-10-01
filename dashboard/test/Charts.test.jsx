import React from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";
import { OutcomeChart } from "../src/components/OutcomeChart.jsx";
import { LevelPerformanceChart } from "../src/components/LevelPerformanceChart.jsx";
import { ActivityChart } from "../src/components/ActivityChart.jsx";
import { FailureReasonsChart } from "../src/components/FailureReasonsChart.jsx";

const summary = { attempts: 4, completed: 2, failed: 1, left: 0, unknown: 1 };

test("keyboard users can inspect outcome counts and shares, including zero outcomes", async () => {
  const user = userEvent.setup();
  const { rerender } = render(<OutcomeChart summary={summary} />);
  await user.tab();
  expect(screen.getByRole("application")).toHaveFocus();
  const tooltip = await screen.findByRole("tooltip");
  expect(within(tooltip).getByText("Completed: 2 (50%)")).toBeVisible();
  expect(within(tooltip).getByText("Failed: 1 (25%)")).toBeVisible();
  expect(within(tooltip).getByText("Left: 0 (0%)")).toBeVisible();
  expect(within(tooltip).getByText("Unknown: 1 (25%)")).toBeVisible();

  // A background refresh must update the active tooltip as well as the legend.
  rerender(
    <OutcomeChart summary={{ ...summary, attempts: 5, completed: 3 }} />,
  );
  expect(await screen.findByText("Completed: 3 (60%)")).toBeVisible();
  await user.tab();
  expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
});

test("level tooltips distinguish measured zero, missing endings and full completion", async () => {
  const user = userEvent.setup();
  render(
    <LevelPerformanceChart
      levels={[
        { level: 1, attempts: 3, completed: 0, unknown: 1, completionRate: 0 },
        {
          level: 2,
          attempts: 2,
          completed: 0,
          unknown: 2,
          completionRate: null,
        },
        { level: 3, attempts: 2, completed: 2, unknown: 0, completionRate: 1 },
      ]}
    />,
  );
  await user.tab();
  let tooltip = await screen.findByRole("tooltip");
  expect(within(tooltip).getByText("0% completed")).toBeVisible();
  expect(
    within(tooltip).getByText("0 of 2 ended attempts completed"),
  ).toBeVisible();
  expect(within(tooltip).getByText("1 unknown")).toBeVisible();
  await user.tab();
  tooltip = await screen.findByRole("tooltip");
  expect(within(tooltip).getByText("No ended attempts")).toBeVisible();
  expect(within(tooltip).queryByText("0% completed")).not.toBeInTheDocument();
  expect(
    within(tooltip).getByText("0 of 0 ended attempts completed"),
  ).toBeVisible();
  expect(within(tooltip).getByText("2 unknown")).toBeVisible();
  await user.tab();
  tooltip = await screen.findByRole("tooltip");
  expect(within(tooltip).getByText("100% completed")).toBeVisible();
  expect(
    within(tooltip).getByText("2 of 2 ended attempts completed"),
  ).toBeVisible();
});

test("level bars share a proportional scale and unknown-only levels retain a patterned track", () => {
  render(
    <LevelPerformanceChart
      levels={[
        {
          level: 1,
          attempts: 2,
          completed: 1,
          unknown: 0,
          completionRate: 0.5,
        },
        { level: 2, attempts: 2, completed: 2, unknown: 0, completionRate: 1 },
        {
          level: 3,
          attempts: 1,
          completed: 0,
          unknown: 1,
          completionRate: null,
        },
      ]}
    />,
  );
  const charts = screen.getAllByRole("application");
  const barWidth = (chart) =>
    Number(
      chart.querySelector(".recharts-bar-rectangle path").getAttribute("width"),
    );
  expect(barWidth(charts[0])).toBeCloseTo(barWidth(charts[1]) / 2);
  expect(
    charts[2].querySelector(".recharts-bar-background-rectangle"),
  ).toHaveAttribute("fill", expect.stringMatching(/^url\(#/));
  expect(screen.getByText("No ended attempts")).toBeVisible();
  expect(within(charts[2]).getByText("0%")).toBeVisible();
  expect(within(charts[2]).getByText("50%")).toBeVisible();
  expect(within(charts[2]).getByText("100%")).toBeVisible();
});

test("activity chart supports keyboard exploration of quiet intervals and exposes exact table values", async () => {
  const user = userEvent.setup();
  render(
    <ActivityChart
      activity={{
        intervalMs: 86400_000,
        buckets: [
          { receivedAt: Date.UTC(2026, 8, 29), attempts: 4, completed: 2 },
          { receivedAt: Date.UTC(2026, 8, 30), attempts: 0, completed: 0 },
          { receivedAt: Date.UTC(2026, 9, 1), attempts: 7, completed: 3 },
        ],
      }}
    />,
  );
  await user.tab();
  expect(screen.getByRole("application")).toHaveFocus();
  let tooltip = await screen.findByRole("tooltip");
  expect(within(tooltip).getByText("4 recorded attempts")).toBeVisible();
  expect(within(tooltip).getByText("2 completed")).toBeVisible();
  await user.keyboard("{ArrowRight}");
  tooltip = await screen.findByRole("tooltip");
  expect(within(tooltip).getByText("0 recorded attempts")).toBeVisible();
  expect(within(tooltip).getByText("0 completed")).toBeVisible();
  await user.click(screen.getByText("View activity data"));
  const table = screen.getByRole("table", {
    name: "Attempt counts by UTC interval start",
  });
  expect(within(table).getAllByRole("row")).toHaveLength(4);
  expect(
    within(table).getByRole("cell", { name: "7", exact: true }),
  ).toBeVisible();
});

test("failure donut exposes per-cause counts, shares and keyboard tooltips", async () => {
  const user = userEvent.setup();
  render(
    <FailureReasonsChart
      failureReasons={[
        { reason: "wall", count: 3 },
        { reason: "snake", count: 1 },
      ]}
    />,
  );
  expect(screen.getByText("75%")).toBeVisible();
  expect(screen.getByText("25%")).toBeVisible();
  await user.tab();
  let tooltip = await screen.findByRole("tooltip");
  expect(within(tooltip).getByText("Wall collision")).toBeVisible();
  expect(within(tooltip).getByText("3 failures · 75%")).toBeVisible();
  await user.keyboard("{ArrowRight}");
  tooltip = await screen.findByRole("tooltip");
  expect(within(tooltip).getByText("Snake collision")).toBeVisible();
  expect(within(tooltip).getByText("1 failure · 25%")).toBeVisible();
});

test("failure chart displays an honest empty state when there are no failures", () => {
  render(<FailureReasonsChart failureReasons={[]} />);
  expect(screen.getByText("No recorded failures")).toBeVisible();
  expect(screen.queryByRole("application")).not.toBeInTheDocument();
  expect(screen.queryByText("100%")).not.toBeInTheDocument();
});
