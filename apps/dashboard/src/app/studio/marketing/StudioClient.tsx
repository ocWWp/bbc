"use client";

// Marketing Studio client state machine. Stages:
//   idle        — hero textarea + submit
//   proposing   — submitted, awaiting proposeWorkflows
//   picking     — 2-4 candidate cards + pick
//   configuring — mini-onboarding form (template.firstUseInputs)
//   running     — runWorkflow in flight; canvas skeleton
//   reviewing   — canvas + action strip (Approve / Edit / Reject)

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { Button } from "@/components/ui/button";
import { OutputBlocks, type CitedMemory } from "@/components/studio/OutputBlocks";
import type { OutputBlock } from "@/lib/studio/output-blocks";
import type { ClientTemplate } from "@/lib/studio/templates/registry";
import type { FirstUseInput } from "@/lib/studio/templates/types";
import {
  acceptStudioRun,
  proposeWorkflows,
  rejectStudioRun,
  runWorkflow,
  type TemplateProposal,
} from "./actions";

type AuthorHint = {
  name?: string;
  handle?: string;
  productName?: string;
  role?: string;
};

type Stage =
  | { kind: "idle" }
  | { kind: "proposing"; task: string }
  | { kind: "picking"; task: string; candidates: TemplateProposal[] }
  | {
      kind: "configuring";
      task: string;
      candidate: TemplateProposal;
      inputs: Record<string, string>;
    }
  | {
      kind: "running";
      task: string;
      candidate: TemplateProposal;
      inputs: Record<string, string>;
    }
  | {
      kind: "reviewing";
      task: string;
      candidate: TemplateProposal;
      inputs: Record<string, string>;
      runId: string;
      blocks: OutputBlock[];
      citedMemories: CitedMemory[];
      reviewed: "accepted" | "rejected" | null;
    };

const PLACEHOLDERS = [
  "Draft a launch tweet for our v1.0 announcement",
  "LinkedIn post for our seed round",
  "Thread explaining why we chose self-hosting first",
  "Cross-platform campaign for our open-source release",
  "Reel script for the founder explaining the product in 30s",
];

type Props = {
  templates: ClientTemplate[];
  authorHint?: AuthorHint;
};

export default function StudioClient({ templates, authorHint }: Props) {
  const [stage, setStage] = useState<Stage>({ kind: "idle" });
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [task, setTask] = useState("");
  const placeholder = useRotatingPlaceholder(stage.kind === "idle");
  const templatesById = useMemo(
    () => new Map(templates.map((t) => [t.id, t])),
    [templates],
  );

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

  const handlePick = useCallback(
    (c: TemplateProposal) => {
      const tpl = templatesById.get(c.templateId);
      const defaults: Record<string, string> = {};
      tpl?.firstUseInputs.forEach((fi) => {
        if (fi.default) defaults[fi.id] = fi.default;
      });
      setStage((prev) => {
        if (prev.kind !== "picking") return prev;
        return { kind: "configuring", task: prev.task, candidate: c, inputs: defaults };
      });
    },
    [templatesById],
  );

  const handleRun = useCallback(
    (inputs: Record<string, string>) => {
      setError(null);
      setStage((prev) => {
        if (prev.kind !== "configuring") return prev;
        return { kind: "running", task: prev.task, candidate: prev.candidate, inputs };
      });
      startTransition(async () => {
        // Read current stage to get task + candidate. We pulled them from the
        // closure intentionally to avoid stale-state bugs.
        const current = stageRef.current;
        if (current.kind !== "running") return;
        const res = await runWorkflow(current.candidate.templateId, current.task, inputs);
        if (!res.ok) {
          setError(res.error);
          setStage({
            kind: "configuring",
            task: current.task,
            candidate: current.candidate,
            inputs,
          });
          return;
        }
        setStage({
          kind: "reviewing",
          task: current.task,
          candidate: current.candidate,
          inputs,
          runId: res.runId,
          blocks: res.blocks,
          citedMemories: res.citedMemories,
          reviewed: null,
        });
      });
    },
    [],
  );

  // stageRef keeps a fresh handle for the async run callback above.
  const stageRef = useRef<Stage>(stage);
  useEffect(() => {
    stageRef.current = stage;
  }, [stage]);

  const handleAccept = useCallback(() => {
    if (stage.kind !== "reviewing") return;
    const id = stage.runId;
    startTransition(async () => {
      const res = await acceptStudioRun(id);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setStage((prev) =>
        prev.kind === "reviewing" ? { ...prev, reviewed: "accepted" } : prev,
      );
    });
  }, [stage]);

  const handleReject = useCallback(() => {
    if (stage.kind !== "reviewing") return;
    const id = stage.runId;
    startTransition(async () => {
      const res = await rejectStudioRun(id);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setStage((prev) =>
        prev.kind === "reviewing" ? { ...prev, reviewed: "rejected" } : prev,
      );
    });
  }, [stage]);

  const handleStartOver = useCallback(() => {
    setStage({ kind: "idle" });
    setError(null);
    setTask("");
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
          <CandidateGrid candidates={stage.candidates} onPick={handlePick} />
        ) : null}

        {stage.kind === "configuring" ? (
          <ConfigureStage
            candidate={stage.candidate}
            template={templatesById.get(stage.candidate.templateId)}
            initialInputs={stage.inputs}
            onBack={() => setStage({ kind: "picking", task: stage.task, candidates: [stage.candidate] })}
            onRun={handleRun}
            disabled={isPending}
          />
        ) : null}

        {stage.kind === "running" ? (
          <RunningStage candidate={stage.candidate} />
        ) : null}

        {stage.kind === "reviewing" ? (
          <ReviewStage
            blocks={stage.blocks}
            citedMemories={stage.citedMemories}
            authorHint={authorHint}
            reviewed={stage.reviewed}
            onAccept={handleAccept}
            onReject={handleReject}
            onStartOver={handleStartOver}
            disabled={isPending}
          />
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
          <CandidateCard
            key={c.templateId}
            candidate={c}
            onPick={() => onPick(c)}
            indexHint={i}
          />
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

// ---------- Configure stage (mini-onboarding) ----------

function ConfigureStage({
  candidate,
  template,
  initialInputs,
  onBack,
  onRun,
  disabled,
}: {
  candidate: TemplateProposal;
  template: ClientTemplate | undefined;
  initialInputs: Record<string, string>;
  onBack: () => void;
  onRun: (inputs: Record<string, string>) => void;
  disabled: boolean;
}) {
  const [values, setValues] = useState<Record<string, string>>(initialInputs);
  const inputs = template?.firstUseInputs ?? [];
  const allRequiredFilled = inputs.every((fi) => !fi.required || values[fi.id]?.trim());

  return (
    <section className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-[11px] font-medium tracking-[0.16em] uppercase text-muted-foreground">
            Picked
          </div>
          <div className="mt-1 text-xl font-semibold tracking-tight">{candidate.label}</div>
        </div>
        <Button variant="ghost" size="sm" onClick={onBack}>
          ← Pick again
        </Button>
      </div>

      {inputs.length === 0 ? (
        <div className="rounded-2xl border bg-card p-5 text-sm text-muted-foreground">
          No extra inputs needed for this workflow.
        </div>
      ) : (
        <div className="rounded-2xl border bg-card p-5 sm:p-6 space-y-4">
          {inputs.map((fi) => (
            <FirstUseInputField
              key={fi.id}
              spec={fi}
              value={values[fi.id] ?? ""}
              onChange={(v) => setValues((prev) => ({ ...prev, [fi.id]: v }))}
            />
          ))}
        </div>
      )}

      <div className="flex items-center justify-end">
        <Button
          variant="studio"
          size="lg"
          onClick={() => onRun(values)}
          disabled={!allRequiredFilled || disabled}
        >
          {disabled ? "Running…" : "Run workflow →"}
        </Button>
      </div>
    </section>
  );
}

function FirstUseInputField({
  spec,
  value,
  onChange,
}: {
  spec: FirstUseInput;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="text-sm font-medium">
          {spec.label}
          {spec.required ? <span className="text-destructive ml-0.5">*</span> : null}
        </span>
        <span className="text-[11px] text-muted-foreground">{spec.hint}</span>
      </div>
      {spec.kind === "select" || spec.kind === "tone" ? (
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
        >
          {!spec.required && !spec.default ? <option value="">—</option> : null}
          {(spec.options ?? []).map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      ) : (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={spec.hint}
          className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
          maxLength={400}
        />
      )}
    </label>
  );
}

// ---------- Running stage (skeleton canvas) ----------

function RunningStage({ candidate }: { candidate: TemplateProposal }) {
  return (
    <section>
      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
        <span className="size-2 rounded-full bg-studio-accent animate-pulse" />
        Generating <span className="font-medium text-foreground">{candidate.label}</span>…
      </div>
      <div className="rounded-2xl border bg-card p-6 space-y-3 animate-pulse">
        <div className="flex items-center gap-3">
          <div className="size-11 rounded-full bg-muted" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-40 rounded bg-muted" />
            <div className="h-2 w-24 rounded bg-muted/70" />
          </div>
        </div>
        <div className="space-y-2 pt-2">
          <div className="h-3 w-full rounded bg-muted" />
          <div className="h-3 w-11/12 rounded bg-muted" />
          <div className="h-3 w-3/4 rounded bg-muted" />
        </div>
      </div>
    </section>
  );
}

// ---------- Reviewing stage (canvas + action strip) ----------

function ReviewStage({
  blocks,
  citedMemories,
  authorHint,
  reviewed,
  onAccept,
  onReject,
  onStartOver,
  disabled,
}: {
  blocks: OutputBlock[];
  citedMemories: CitedMemory[];
  authorHint?: AuthorHint;
  reviewed: "accepted" | "rejected" | null;
  onAccept: () => void;
  onReject: () => void;
  onStartOver: () => void;
  disabled: boolean;
}) {
  return (
    <section>
      <div className="text-xs font-semibold tracking-[0.16em] uppercase text-muted-foreground mb-4">
        Output
      </div>
      <OutputBlocks blocks={blocks} citedMemories={citedMemories} authorHint={authorHint} />

      <div className="mt-6 flex items-center justify-between gap-3 rounded-2xl border bg-card px-4 py-3">
        <div className="text-sm text-muted-foreground">
          {reviewed === "accepted" ? (
            <span className="text-foreground font-medium">Accepted · ready to ship</span>
          ) : reviewed === "rejected" ? (
            <span className="text-foreground font-medium">Rejected · saved for context</span>
          ) : (
            <span>Review and decide.</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {reviewed ? (
            <Button variant="studio" size="default" onClick={onStartOver}>
              New task
            </Button>
          ) : (
            <>
              <Button variant="ghost" size="default" onClick={onReject} disabled={disabled}>
                Reject
              </Button>
              <Button variant="studio" size="default" onClick={onAccept} disabled={disabled}>
                Approve
              </Button>
            </>
          )}
        </div>
      </div>
    </section>
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
