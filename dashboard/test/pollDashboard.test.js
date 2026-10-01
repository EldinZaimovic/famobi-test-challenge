import { test } from "node:test";
import assert from "node:assert/strict";
import { setImmediate } from "node:timers/promises";
import { pollDashboard } from "../src/pollDashboard.js";

const response = (data) => ({ ok: true, json: async () => data });

function setup(t, fetcher) {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let state = { data: null, error: "", loading: true };
  const poller = pollDashboard(
    new URLSearchParams({ days: "7", level: "2" }),
    (patch) => {
      state = { ...state, ...patch };
    },
    fetcher,
  );
  t.after(() => poller.stop());
  return { poller, state: () => state };
}

test("loads the selected cohort and polls five seconds after completion", async (t) => {
  let calls = 0;
  const { state } = setup(t, async (url) => {
    assert.equal(url, "/api/dashboard?days=7&level=2");
    return response({ attempts: ++calls });
  });
  await setImmediate();
  assert.deepEqual(state(), {
    data: { attempts: 1 },
    error: "",
    loading: false,
  });
  t.mock.timers.tick(4999);
  assert.equal(calls, 1);
  t.mock.timers.tick(1);
  await setImmediate();
  assert.equal(state().data.attempts, 2);
});

test("failed manual refresh retains the previous data and recovery clears the error", async (t) => {
  let fail = false;
  const { poller, state } = setup(t, async () =>
    fail ? { ok: false, status: 503 } : response({ attempts: 8 }),
  );
  await setImmediate();
  fail = true;
  const refresh = poller.refresh();
  assert.equal(state().data.attempts, 8);
  assert.equal(state().loading, true);
  await refresh;
  assert.equal(state().data.attempts, 8);
  assert.match(state().error, /503/);
  assert.equal(state().loading, false);
  fail = false;
  t.mock.timers.tick(5000);
  await setImmediate();
  assert.equal(state().error, "");
  assert.equal(state().data.attempts, 8);
});

test("a stalled request is aborted after ten seconds and retried without overlapping", async (t) => {
  let calls = 0;
  let signal;
  const { state } = setup(t, (_url, options) => {
    calls++;
    signal = options.signal;
    return new Promise((_resolve, reject) => {
      signal.addEventListener("abort", () => reject(new Error("aborted")), {
        once: true,
      });
    });
  });
  t.mock.timers.tick(9999);
  assert.equal(calls, 1);
  assert.equal(signal.aborted, false);
  t.mock.timers.tick(1);
  await setImmediate();
  assert.equal(signal.aborted, true);
  assert.match(state().error, /timed out/);
  assert.equal(state().loading, false);
  t.mock.timers.tick(5000);
  assert.equal(calls, 2);
});

test("changing filters or unmounting aborts and ignores late responses", async (t) => {
  let resolve;
  let signal;
  let calls = 0;
  const { poller, state } = setup(t, (_url, options) => {
    calls++;
    signal = options.signal;
    return new Promise((done) => {
      resolve = done;
    });
  });
  const previous = state();
  poller.stop();
  assert.equal(signal.aborted, true);
  resolve(response({ wrongCohort: true }));
  await setImmediate();
  t.mock.timers.tick(30_000);
  await poller.refresh();
  assert.deepEqual(state(), previous);
  assert.equal(calls, 1);
});

test("a replaced request cannot overwrite a newer result", async (t) => {
  const pending = [];
  const { poller, state } = setup(
    t,
    () => new Promise((resolve) => pending.push(resolve)),
  );
  const refresh = poller.refresh();
  pending[1](response({ version: 2 }));
  await refresh;
  pending[0](response({ version: 1 }));
  await setImmediate();
  assert.equal(state().data.version, 2);
  t.mock.timers.tick(5000);
  assert.equal(pending.length, 3);
});

test("invalid JSON produces a recoverable error instead of clearing data", async (t) => {
  let invalid = false;
  const { poller, state } = setup(t, async () =>
    invalid
      ? {
          ok: true,
          json: async () => {
            throw new SyntaxError("Invalid JSON");
          },
        }
      : response({ attempts: 2 }),
  );
  await setImmediate();
  invalid = true;
  await poller.refresh();
  assert.match(state().error, /Invalid JSON/);
  assert.equal(state().data.attempts, 2);
  assert.equal(state().loading, false);
});
