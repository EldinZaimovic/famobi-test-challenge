export const OUTCOMES = [
  ["completed", "Completed"],
  ["failed", "Failed"],
  ["left", "Left"],
  ["unknown", "Unknown"],
];
const REASONS = {
  wall: "Wall collision",
  snake: "Snake collision",
  obstacle: "Obstacle collision",
  external: "Ended by platform",
  menu: "Returned to menu",
  restart: "Restarted level",
  replaced: "Started another attempt",
  page_exit: "Page closed or left",
  disposed: "Game closed",
};
export const formatReason = (reason) =>
  REASONS[reason] ?? reason ?? "Not applicable";
