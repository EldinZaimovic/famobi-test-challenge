// One request at a time; late responses cannot overwrite a newer selection.
export function pollDashboard(query, onChange, fetcher = fetch) {
  let stopped = false;
  let timer;
  let controller;
  let generation = 0;

  async function refresh() {
    if (stopped) return;
    const request = ++generation;
    clearTimeout(timer);
    controller?.abort();
    const current = new AbortController();
    controller = current;
    onChange({ loading: true });
    const timeout = setTimeout(() => current.abort(), 10_000);
    try {
      const response = await fetcher(`/api/dashboard?${query}`, {
        signal: current.signal,
      });
      if (!response.ok) throw new Error(`API returned ${response.status}`);
      const data = await response.json();
      if (!stopped && request === generation) onChange({ data, error: "" });
    } catch (error) {
      if (!stopped && request === generation)
        onChange({
          error: current.signal.aborted
            ? "The analytics request timed out. Retrying automatically."
            : `Cannot reach analytics. Check that npm run dev is running. ${error.message}`,
        });
    } finally {
      clearTimeout(timeout);
      if (!stopped && request === generation) {
        onChange({ loading: false });
        timer = setTimeout(refresh, 5000);
      }
    }
  }

  void refresh();
  return {
    refresh,
    stop() {
      stopped = true;
      clearTimeout(timer);
      controller?.abort();
    },
  };
}
