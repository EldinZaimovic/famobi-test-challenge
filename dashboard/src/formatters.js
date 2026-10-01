export const formatNumber = (value) =>
  value == null ? "—" : new Intl.NumberFormat().format(Math.round(value));
export const formatPercent = (value) =>
  value == null ? "—" : `${Math.round(value * 100)}%`;
export const formatDuration = (value) => {
  if (value == null) return "—";
  if (value < 60_000) return `${(value / 1000).toFixed(1)}s`;
  const seconds = Math.round(value / 1000);
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
};
export const formatTimestamp = (value) =>
  value == null ? "Not recorded" : new Date(value).toLocaleString();
