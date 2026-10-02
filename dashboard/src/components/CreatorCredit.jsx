import React, { useState } from "react";

export function CreatorCredit() {
  const [phase, setPhase] = useState("ready");

  function finishAnimation(event) {
    if (event.target !== event.currentTarget || phase !== "eating") return;
    setPhase("done");
  }

  return (
    <div className={`creator-credit creator-credit--${phase}`}>
      <button
        className="creator-credit-button"
        type="button"
        aria-disabled={phase !== "ready"}
        title={phase === "done" ? undefined : "Feed the snake"}
        onClick={() => {
          if (phase === "ready") setPhase("eating");
        }}
      >
        <span className="creator-credit-author">Build by Eldin Zaimović</span>
        <span className="creator-credit-slot">
          {phase !== "done" && (
            <span className="creator-credit-snack">
              <span
                className="creator-credit-message"
                onAnimationEnd={finishAnimation}
              >
                and <span>AI (or SI up to you)</span>
              </span>
              {phase === "eating" && (
                <span className="credit-snake-runner" aria-hidden="true">
                  <svg viewBox="0 0 48 24" fill="none">
                    <g className="credit-snake-body">
                      <path
                        d="M10 12H19Q24 12 24 7T33 7T44 12"
                        stroke="currentColor"
                        strokeWidth="6"
                        strokeLinecap="round"
                      />
                      <rect
                        x="0"
                        y="6"
                        width="14"
                        height="12"
                        rx="5"
                        fill="currentColor"
                      />
                      <circle cx="4" cy="9" r="1.4" fill="#10191c" />
                      <circle cx="4" cy="15" r="1.4" fill="#10191c" />
                    </g>
                    <path
                      className="credit-snake-signature"
                      d="M30 4H14V20H30M14 12H27"
                      stroke="currentColor"
                      strokeWidth="4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
              )}
            </span>
          )}
        </span>
      </button>
      <span className="sr-only" role="status">
        {phase === "done"
          ? "The snake enjoyed its snack. Build by Eldin Zaimović."
          : ""}
      </span>
    </div>
  );
}
