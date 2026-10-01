import React from "react";
import { createRoot } from "react-dom/client";
import { Dashboard } from "./Dashboard.jsx";
import "./style.css";

console.info(
  "%c🐍 Neon Snake%c\nCrafted by Eldin Zaimovic\nCurious minds find the best bugs.",
  "color: #b9ed83; background: #10191c; font-size: 20px; font-weight: bold; padding: 8px 12px; border-radius: 6px;",
  "color: #b9ed83; font-family: monospace; font-size: 12px; line-height: 1.8;",
);

createRoot(document.getElementById("root")).render(<Dashboard />);
