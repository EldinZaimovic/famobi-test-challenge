import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";

// jsdom has no layout engine. Supply dimensions at the browser boundary so the
// real Recharts components (including their keyboard handlers) can render.
beforeEach(() => {
  vi.spyOn(
    globalThis.HTMLElement.prototype,
    "getBoundingClientRect",
  ).mockImplementation(function () {
    const height = Number.parseFloat(this.style.height) || 40;
    return {
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 400,
      bottom: height,
      width: 400,
      height,
      toJSON() {},
    };
  });
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback) {
        this.callback = callback;
      }
      observe(element) {
        this.callback([{ contentRect: element.getBoundingClientRect() }]);
      }
      unobserve() {}
      disconnect() {}
    },
  );
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
