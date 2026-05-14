"use client";

// Conversational workflow editor. Floats a button on the canvas; clicking
// opens an overlay where the user types a correction ("this always misses
// our product taglines"). The propose action converts it into a structured
// override rule; the user reviews + saves.
//
// Actions are passed in as props so this component can be reused across
// studios (marketing, engineering, …) without coupling to any single one.

import { useCallback, useEffect, useId, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";

export type OverrideKind =
  | "add_constraint"
  | "replace_section"
  | "add_example"
  | "forbid_pattern";

export type ProposedOverride = {
  kind: OverrideKind;
  value: Record<string, unknown>;
  summary: string;
};

export type ProposeOverrideResult =
  | { ok: true; proposal: ProposedOverride }
  | { ok: false; error: string };

export type SaveOverrideResult =
  | { ok: true; overrideId: string }
  | { ok: false; error: string };

type Props = {
  templateId: string;
  templateLabel: string;
  sourceRunId?: string;
  onSaved?: (overrideSummary: string) => void;
  proposeAction: (templateId: string, message: string) => Promise<ProposeOverrideResult>;
  saveAction: (input: {
    templateId: string;
    proposal: ProposedOverride;
    sourceRunId?: string;
  }) => Promise<SaveOverrideResult>;
};

type Phase =
  | { kind: "closed" }
  | { kind: "composing" }
  | { kind: "thinking" }
  | { kind: "reviewing"; proposal: ProposedOverride }
  | { kind: "saved"; proposal: ProposedOverride };

export function EditWorkflowChat({
  templateId,
  templateLabel,
  sourceRunId,
  onSaved,
  proposeAction,
  saveAction,
}: Props) {
  const [phase, setPhase] = useState<Phase>({ kind: "closed" });
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const dialogId = useId();

  // Esc to close.
  useEffect(() => {
    if (phase.kind === "closed") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPhase({ kind: "closed" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase.kind]);

  const handleOpen = useCallback(() => {
    setPhase({ kind: "composing" });
    setMessage("");
    setError(null);
  }, []);

  const handleSubmit = useCallback(() => {
    if (message.trim().length < 4) {
      setError("Tell me what to fix -- at least a few words.");
      return;
    }
    setError(null);
    setPhase({ kind: "thinking" });
    startTransition(async () => {
      const res = await proposeAction(templateId, message);
      if (!res.ok) {
        setError(res.error);
        setPhase({ kind: "composing" });
        return;
      }
      setPhase({ kind: "reviewing", proposal: res.proposal });
    });
  }, [message, templateId, proposeAction]);

  const handleSave = useCallback(() => {
    if (phase.kind !== "reviewing") return;
    const proposal = phase.proposal;
    startTransition(async () => {
      const res = await saveAction({
        templateId,
        proposal,
        sourceRunId,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setPhase({ kind: "saved", proposal });
      onSaved?.(proposal.summary);
    });
  }, [phase, templateId, sourceRunId, onSaved, saveAction]);

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={handleOpen}
        className="gap-1.5"
        aria-haspopup="dialog"
        aria-expanded={phase.kind !== "closed"}
        aria-controls={dialogId}
      >
        <PencilIcon />
        Edit this workflow
      </Button>

      {phase.kind !== "closed" ? (
        <div
          role="dialog"
          aria-modal="true"
          id={dialogId}
          aria-labelledby={`${dialogId}-title`}
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur-sm px-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setPhase({ kind: "closed" });
          }}
        >
          <div className="w-full max-w-lg rounded-2xl border bg-card text-card-foreground shadow-xl">
            <header className="px-5 py-4 border-b flex items-center justify-between">
              <div>
                <div className="text-[11px] uppercase tracking-[0.18em] font-semibold text-muted-foreground">
                  Edit workflow
                </div>
                <h2 id={`${dialogId}-title`} className="text-base font-semibold mt-0.5">
                  {templateLabel}
                </h2>
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setPhase({ kind: "closed" })}
                aria-label="Close"
              >
                ✕
              </Button>
            </header>

            <div className="p-5 space-y-4">
              {phase.kind === "composing" ? (
                <ComposingView
                  message={message}
                  setMessage={setMessage}
                  onSubmit={handleSubmit}
                  error={error}
                />
              ) : null}
              {phase.kind === "thinking" ? <ThinkingView /> : null}
              {phase.kind === "reviewing" ? (
                <ReviewingView
                  proposal={phase.proposal}
                  onSave={handleSave}
                  onCancel={() => setPhase({ kind: "composing" })}
                  error={error}
                />
              ) : null}
              {phase.kind === "saved" ? (
                <SavedView
                  proposal={phase.proposal}
                  onClose={() => setPhase({ kind: "closed" })}
                />
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function ComposingView({
  message,
  setMessage,
  onSubmit,
  error,
}: {
  message: string;
  setMessage: (s: string) => void;
  onSubmit: () => void;
  error: string | null;
}) {
  return (
    <div className="space-y-3">
      <label className="block">
        <div className="text-sm font-medium mb-1.5">What should this workflow do differently?</div>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              onSubmit();
            }
          }}
          placeholder="e.g. always include our product taglines from voice memory"
          rows={4}
          maxLength={1000}
          className="w-full resize-y rounded-md border bg-background px-3 py-2 text-sm leading-snug focus:outline-none focus:ring-2 focus:ring-ring/40 min-h-[100px]"
          autoFocus
        />
      </label>
      {error ? (
        <div className="text-xs text-destructive" role="alert">
          {error}
        </div>
      ) : null}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{message.length}/1000 · ⌘↵ to propose</span>
        <Button variant="studio" size="sm" onClick={onSubmit} disabled={message.trim().length < 4}>
          Propose change
        </Button>
      </div>
    </div>
  );
}

function ThinkingView() {
  return (
    <div className="flex items-center gap-3 py-4">
      <span className="size-2 rounded-full bg-studio-accent animate-pulse" />
      <span className="text-sm text-muted-foreground">Drafting the override…</span>
    </div>
  );
}

function ReviewingView({
  proposal,
  onSave,
  onCancel,
  error,
}: {
  proposal: ProposedOverride;
  onSave: () => void;
  onCancel: () => void;
  error: string | null;
}) {
  return (
    <div className="space-y-3">
      <div className="rounded-xl border bg-muted/40 p-4">
        <div className="text-[11px] uppercase tracking-[0.16em] font-semibold text-muted-foreground mb-2">
          {kindLabel(proposal.kind)}
        </div>
        <div className="text-[15px] font-medium leading-snug">{proposal.summary}</div>
        <ValueDetails value={proposal.value} kind={proposal.kind} />
      </div>
      {error ? (
        <div className="text-xs text-destructive" role="alert">
          {error}
        </div>
      ) : null}
      <div className="flex items-center justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Rewrite
        </Button>
        <Button variant="studio" size="sm" onClick={onSave}>
          Save for this workflow
        </Button>
      </div>
    </div>
  );
}

function SavedView({
  proposal,
  onClose,
}: {
  proposal: ProposedOverride;
  onClose: () => void;
}) {
  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4">
        <div className="text-[11px] uppercase tracking-[0.16em] font-semibold text-emerald-700 dark:text-emerald-400 mb-1">
          Saved
        </div>
        <div className="text-sm">{proposal.summary}</div>
        <div className="text-xs text-muted-foreground mt-1">
          The next run of this workflow will apply this customization.
        </div>
      </div>
      <div className="flex items-center justify-end">
        <Button variant="studio" size="sm" onClick={onClose}>
          Done
        </Button>
      </div>
    </div>
  );
}

function ValueDetails({
  value,
  kind,
}: {
  value: Record<string, unknown>;
  kind: ProposedOverride["kind"];
}) {
  const lines = formatValueLines(value, kind);
  if (lines.length === 0) return null;
  return (
    <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
      {lines.map((l, i) => (
        <li key={i}>
          <span className="font-medium text-foreground/80">{l.label}:</span> {l.text}
        </li>
      ))}
    </ul>
  );
}

function formatValueLines(
  v: Record<string, unknown>,
  kind: ProposedOverride["kind"],
): Array<{ label: string; text: string }> {
  const pick = (k: string) => (typeof v[k] === "string" ? (v[k] as string) : null);
  switch (kind) {
    case "add_constraint":
      return pick("constraint") ? [{ label: "Always", text: pick("constraint")! }] : [];
    case "forbid_pattern":
      return pick("pattern") ? [{ label: "Never", text: pick("pattern")! }] : [];
    case "add_example":
      return pick("example") ? [{ label: "Example", text: pick("example")! }] : [];
    case "replace_section": {
      const out: Array<{ label: string; text: string }> = [];
      const t = pick("target");
      const r = pick("replacement");
      if (t) out.push({ label: "Replace", text: t });
      if (r) out.push({ label: "With", text: r });
      return out;
    }
  }
}

function kindLabel(kind: ProposedOverride["kind"]): string {
  switch (kind) {
    case "add_constraint":
      return "Add constraint";
    case "replace_section":
      return "Replace section";
    case "add_example":
      return "Add example";
    case "forbid_pattern":
      return "Forbid pattern";
  }
}

function PencilIcon() {
  return (
    <svg
      width={14}
      height={14}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M3 21l3-1 11-11-2-2L4 18l-1 3z" />
      <path d="M14 5l3 3" />
    </svg>
  );
}
