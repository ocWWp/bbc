"use client";

import { useState } from "react";
import type { RoleChip } from "@/lib/studio/role-shapes";

export type StudioPromptSubmit = {
  text: string;
  /** When set, the user picked a default chip; the existing client should
   *  route to that template's flow. When undefined, the client decides
   *  (e.g. Marketing's router picks the best-fit template for free text). */
  templateSlug?: string;
};

export type StudioPromptProps = {
  chips: ReadonlyArray<RoleChip>;
  onSubmit: (input: StudioPromptSubmit) => void;
  /** Disable while a generation is in flight. */
  busy?: boolean;
  placeholder?: string;
};

/**
 * Task 19: hybrid prompt-first input. Free-form textarea + optional template
 * chip. The chip narrows the request to a specific template; without one,
 * the role's existing client decides what to do with the free text.
 *
 * Each Studio's existing client renders this inside StudioShell's promptSlot
 * and wires onSubmit to its own server action.
 */
export function StudioPrompt({
  chips,
  onSubmit,
  busy = false,
  placeholder = "What would you like to write?",
}: StudioPromptProps) {
  const [text, setText] = useState("");
  const [activeChip, setActiveChip] = useState<string | undefined>(undefined);

  const submit = () => {
    if (!text.trim() || busy) return;
    onSubmit({ text: text.trim(), templateSlug: activeChip });
  };

  return (
    <div className="studio-prompt-block">
      <textarea
        className="studio-prompt-textarea"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={placeholder}
        rows={3}
        aria-label="prompt"
        disabled={busy}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
            e.preventDefault();
            submit();
          }
        }}
      />
      <div className="studio-chips" role="group" aria-label="template chips">
        {chips.map((c) => {
          const active = activeChip === c.templateSlug;
          return (
            <button
              key={c.id}
              type="button"
              className={`studio-chip ${active ? "is-active" : ""}`}
              data-testid={`studio-chip-${c.id}`}
              aria-pressed={active}
              onClick={() => setActiveChip(active ? undefined : c.templateSlug)}
              disabled={busy}
            >
              {c.label}
            </button>
          );
        })}
      </div>
      <div className="studio-prompt-actions">
        <button
          type="button"
          className="btn btn-primary"
          data-testid="studio-prompt-submit"
          onClick={submit}
          disabled={!text.trim() || busy}
        >
          {busy ? "Generating…" : "Generate"}
        </button>
        <span className="kbd" aria-hidden>
          ⌘↵
        </span>
      </div>
    </div>
  );
}
