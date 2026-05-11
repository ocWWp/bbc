"use client";

// Marketing Studio client state machine. Stages:
//   idle       — hero textarea + submit
//   proposing  — submitted, awaiting proposeWorkflows
//   picking    — 2-4 candidate cards + pick
//   (J.12 will add: configuring → running → reviewing)
//
// J.11 ships idle + proposing + picking. Picking a card just sets state for
// now; the configuring/canvas stages land in J.12.

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { proposeWorkflows, type TemplateProposal } from "./actions";

type Stage =
  | { kind: "idle" }
  | { kind: "proposing"; task: string }
  | { kind: "picking"; task: string; candidates: TemplateProposal[] }
  | { kind: "configuring"; task: string; candidate: TemplateProposal };

const PLACEHOLDERS = [
  "Draft a launch tweet for our v1.0 announcement",
  "LinkedIn post for our seed round",
  "Thread explaining why we chose self-hosting first",
  "Cross-platform campaign for our open-source release",
  "Reel script for the founder explaining the product in 30s",
];

export default function StudioClient() {
  const [stage, setStage] = useState<Stage>({ kind: "idle" });
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [task, setTask] = useState("");
  const placeholder = useRotatingPlaceholder(stage.kind === "idle");

  const handleSubmit = useCallback(() => {
    const trimmed = task.trim();
    if (trimmed.length < 8) {
      setError("Describe the task in at least 8 characters.");
      return;
    }
    setError(null);
    setStage({ kind: "proposing", task: trimmed });
    startTransition(async () => {
      const res = await proposeWorkflows(trimmed);
      if (!res.ok) {
        setError(res.error);
        setStage({ kind: "idle" });
        return;
      }
      setStage({ kind: "picking", task: trimmed, candidates: res.candidates });
    });
  }, [task]);

  const handleReset = useCallback(() => {
    setStage({ kind: "idle" });
    setError(null);
  }, []);

  return (
    <div>
      <TaskEntry
        task={task}
        setTask={setTask}
        placeholder={placeholder}
        onSubmit={handleSubmit}
        disabled={stage.kind === "proposing" || isPending}
        currentTaskInFlight={stage.kind !== "idle" ? stage.task : null}
        onReset={handleReset}
      />

      {error ? (
        <div
          role="alert"
          className="mt-4 rounded-lg border border-destructive/40 bg-destructive/5 text-destructive px-4 py-3 text-sm"
        >
          {error}
        </div>
      ) : null}

      <div className="mt-10">
        {stage.kind === "proposing" ? <CandidateSkeleton /> : null}
        {stage.kind === "picking" ? (
          <CandidateGrid
            candidates={stage.candidates}
            onPick={(c) =>
              setStage({ kind: "configuring", task: stage.task, candidate: c })
            }
          />
        ) : null}
        {stage.kind === "configuring" ? (
          <div className="rounded-2xl border bg-card text-card-foreground p-6 text-sm text-muted-foreground">
            Picked <span className="font-semibold text-foreground">{stage.candidate.label}</span>.
            <div className="text-xs mt-1">
              Configuration + canvas land in J.12.
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ---------- Task entry ----------

function TaskEntry({
  task,
  setTask,
  placeholder,
  onSubmit,
  disabled,
  currentTaskInFlight,
  onReset,
}: {
  task: string;
  setTask: (s: string) => void;
  placeholder: string;
  onSubmit: () => void;
  disabled: boolean;
  currentTaskInFlight: string | null;
  onReset: () => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  // Auto-grow.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = Math.min(el.scrollHeight, 260) + "px";
  }, [task]);

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      onSubmit();
    }
  };

  if (currentTaskInFlight) {
    return (
      <div className="flex items-start gap-3 rounded-2xl border bg-card text-card-foreground px-4 py-3">
        <div className="text-[11px] font-semibold tracking-[0.16em] uppercase text-muted-foreground shrink-0 mt-1">
          Task
        </div>
        <div className="flex-1 text-[15px] leading-snug">{currentTaskInFlight}</div>
        <Button variant="ghost" size="sm" onClick={onReset}>
          Edit
        </Button>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border bg-card text-card-foreground p-3 sm:p-4 shadow-sm focus-within:ring-2 focus-within:ring-ring/40 transition-shadow">
      <textarea
        ref={textareaRef}
        value={task}
        onChange={(e) => setTask(e.target.value)}
        onKeyDown={handleKey}
        placeholder={placeholder}
        disabled={disabled}
        rows={2}
        className="w-full resize-none bg-transparent text-[18px] leading-[1.5] placeholder:text-muted-foreground/70 focus:outline-none px-2 py-2 disabled:opacity-60"
        aria-label="What do you want to make?"
        maxLength={500}
      />
      <div className="mt-2 flex items-center justify-between px-1">
        <div className="text-xs text-muted-foreground tabular-nums">
          {task.length}/500 · ⌘↵ to send
        </div>
        <Button
          variant="studio"
          size="default"
          onClick={onSubmit}
          disabled={disabled || task.trim().length < 8}
        >
          {disabled ? "Thinking…" : "Generate ideas"}
        </Button>
      </div>
    </div>
  );
}

// ---------- Candidate grid ----------

function CandidateGrid({
  candidates,
  onPick,
}: {
  candidates: TemplateProposal[];
  onPick: (c: TemplateProposal) => void;
}) {
  return (
    <section>
      <h2 className="text-xs font-semibold tracking-[0.16em] uppercase text-muted-foreground mb-4">
        {candidates.length} ways to do this
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
        {candidates.map((c, i) => (
          <CandidateCard key={c.templateId} candidate={c} onPick={() => onPick(c)} indexHint={i} />
        ))}
      </div>
    </section>
  );
}

function CandidateCard({
  candidate,
  onPick,
  indexHint,
}: {
  candidate: TemplateProposal;
  onPick: () => void;
  indexHint: number;
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      className="group text-left rounded-2xl border bg-card text-card-foreground p-5 hover:border-foreground/30 hover:bg-accent/40 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-medium tracking-[0.16em] uppercase text-muted-foreground">
            Option {indexHint + 1}
          </div>
          <div className="mt-1 text-[17px] font-semibold tracking-tight">{candidate.label}</div>
        </div>
        <span
          aria-hidden
          className="shrink-0 mt-1 size-7 rounded-full bg-muted text-muted-foreground inline-flex items-center justify-center group-hover:bg-foreground group-hover:text-background transition-colors"
        >
          →
        </span>
      </div>
      <div className="mt-3 text-[14px] leading-[1.55] text-muted-foreground">
        {candidate.rationale}
      </div>
    </button>
  );
}

function CandidateSkeleton() {
  return (
    <div className="space-y-4">
      <div className="h-3 w-32 rounded bg-muted animate-pulse" />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="rounded-2xl border bg-card p-5 space-y-3 animate-pulse"
          >
            <div className="h-3 w-20 rounded bg-muted" />
            <div className="h-5 w-3/4 rounded bg-muted" />
            <div className="h-3 w-full rounded bg-muted" />
            <div className="h-3 w-5/6 rounded bg-muted" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------- Rotating placeholder ----------

function useRotatingPlaceholder(active: boolean): string {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % PLACEHOLDERS.length), 3500);
    return () => clearInterval(t);
  }, [active]);
  return useMemo(() => PLACEHOLDERS[idx] ?? PLACEHOLDERS[0], [idx]);
}
