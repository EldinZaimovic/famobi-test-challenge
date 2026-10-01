import { useEffect, useRef, useState } from "react";
import { pollDashboard } from "./pollDashboard.js";

const initialState = { data: null, error: "", loading: true };

export function useDashboard({ days, level, outcome }) {
  const queryKey = new URLSearchParams({
    days,
    ...(level ? { level } : {}),
    ...(outcome ? { outcome } : {}),
  }).toString();
  const [state, setState] = useState(initialState);
  const poller = useRef(null);
  useEffect(() => {
    const current = pollDashboard(queryKey, (change) => {
      setState((previous) => ({
        ...(previous.queryKey === queryKey ? previous : initialState),
        ...change,
        queryKey,
      }));
    });
    poller.current = current;
    return () => current.stop();
  }, [queryKey]);
  // Never label the previous cohort's numbers with a newly selected filter.
  return {
    ...(state.queryKey === queryKey ? state : initialState),
    queryKey,
    refresh: () => poller.current?.refresh(),
  };
}
