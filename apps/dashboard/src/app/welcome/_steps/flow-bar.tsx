"use client";

import React from "react";

/**
 * Chromeless onboarding/auth header. Brand mark + breadcrumb on the left,
 * step rail and optional right slot on the right. Step rail collapses
 * to nothing when `step` is null (e.g. auth surfaces use the slot only).
 *
 * Ported from the Claude Design bundle (xjEaNlbAJK6NEegZ7RU04A).
 */
type Props = {
  step?: number | null;
  total?: number;
  crumb?: string;
  right?: React.ReactNode;
};

export function FlowBar({ step = null, total = 3, crumb = "/welcome", right }: Props) {
  const labels = total === 3
    ? ["dump", "extract", "review"]
    : ["dump", "extract", "review", "done"];
  return (
    <header className="flow-bar">
      <span className="brand">
        <span className="brand-mark">bbc</span>
        <span>bbc</span>
      </span>
      <span className="crumb-sep">/</span>
      <span className="crumb">{crumb}</span>
      <div className="flow-bar-right">
        {step != null && (
          <div className="steprail">
            {labels.map((lbl, i) => (
              <React.Fragment key={lbl}>
                <span
                  className={
                    "steprail-step " +
                    (i < step ? "is-done" : i === step ? "is-current" : "")
                  }
                >
                  <span className="dot" />
                  <span>{String(i + 1).padStart(2, "0")} {lbl}</span>
                </span>
                {i < labels.length - 1 && <span className="steprail-rule" />}
              </React.Fragment>
            ))}
          </div>
        )}
        {right}
      </div>
    </header>
  );
}
