import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";
import { CreatorCredit } from "../src/components/CreatorCredit.jsx";

test("keyboard activation feeds the snake and leaves the author credit with stable focus", async () => {
  const user = userEvent.setup();
  render(<CreatorCredit />);
  const button = screen.getByRole("button", {
    name: "Build by Eldin Zaimović and AI (or SI up to you)",
  });
  const author = screen.getByText("Build by Eldin Zaimović");
  expect(author).toBeVisible();
  await user.tab();
  expect(button).toHaveFocus();
  await user.keyboard("{Enter}");
  expect(button).toHaveAttribute("aria-disabled", "true");
  await user.keyboard("{Enter}");
  // Both the normal devour and reduced-motion fade finish on this element.
  fireEvent.animationEnd(button.querySelector(".creator-credit-message"));
  expect(screen.getByRole("button", { name: "Build by Eldin Zaimović" })).toBe(
    button,
  );
  expect(button).toHaveFocus();
  expect(button).toHaveAttribute("aria-disabled", "true");
  expect(author).toBeVisible();
  expect(screen.getByRole("status")).toHaveTextContent(
    "The snake enjoyed its snack.",
  );
});

test("the credit resets on remount and decorative animation events do not finish it early", async () => {
  const user = userEvent.setup();
  const { unmount } = render(<CreatorCredit />);
  await user.click(screen.getByRole("button"));
  const message = screen
    .getByRole("button")
    .querySelector(".creator-credit-message");
  fireEvent.animationEnd(message.firstElementChild);
  expect(screen.getByRole("button")).toBeInTheDocument();
  fireEvent.animationEnd(message);
  unmount();
  render(<CreatorCredit />);
  expect(
    screen.getByRole("button", {
      name: "Build by Eldin Zaimović and AI (or SI up to you)",
    }),
  ).toHaveAttribute("aria-disabled", "false");
});

test("clicking the author name starts the animation without consuming the author", async () => {
  const user = userEvent.setup();
  render(<CreatorCredit />);
  const author = screen.getByText("Build by Eldin Zaimović");
  const button = screen.getByRole("button");
  await user.click(author);
  expect(button).toHaveAttribute("aria-disabled", "true");
  fireEvent.animationEnd(button.querySelector(".creator-credit-message"));
  expect(author).toBeVisible();
  expect(
    screen.queryByText("AI (or SI up to you)", { exact: true }),
  ).not.toBeInTheDocument();
  await user.click(author);
  expect(screen.getByRole("button")).toHaveAttribute("aria-disabled", "true");
});
