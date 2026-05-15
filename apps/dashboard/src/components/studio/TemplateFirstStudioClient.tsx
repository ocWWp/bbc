"use client";

// The one studio client all 8 role studios share. Stages:
//   idle           -- task textarea + template grid
//   configuring    -- picked template's firstUseInputs form
//   plan-confirming -- PlanConfirmStage: intent + candidate memory, pre-generation
//   running        -- generation in flight
//   reviewing      -- output + review (light: edit-chat; full: Approve/Reject)
// Per-role divergence lives entirely in `config` (template-first-config.ts);
// this component has zero role-specific branching.

import { useState, useTransition } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { OutputBlocks } from "@/components/studio/OutputBlocks";
import { EditWorkflowChat } from "@/components/studio/EditWorkflowChat";
import { ActiveOverridesPill } from "@/components/studio/ActiveOverridesPill";
import { PlanConfirmStage } from "@/components/studio/PlanConfirmStage";
import { TemplateKindGlyph, kindLabel } from "@/components/studio/TemplateKindGlyph";
import { previewPlan } from "@/lib/studio/preview-plan-action";
import { TASK_MIN_LEN, TASK_MAX_LEN } from "@/lib/studio/task-limits";
import type { PlanPreview } from "@/lib/studio/plan-preview";
import type { OutputBlock } from "@/lib/studio/output-blocks";
import type {
  TemplateFirstConfig,
  StudioClientTemplate,
  StudioSeed,
  CitedMemory,
} from "./template-first-config";

type Stage<T extends StudioClientTemplate> =
  | { kind: "idle" }
  | { kind: "configuring"; template: T; task: string; inputs: Record<string, string> }
  | { kind: "plan-confirming"; template: T; task: string; inputs: Record<string, string>; plan: PlanPreview }
  | { kind: "running"; template: T; task: string }
  | { kind: "reviewing"; template: T; task: string; blocks: OutputBlock[]; cited: CitedMemory[]; runId: string }
  | { kind: "error"; message: string };

type Props<T extends StudioClientTemplate> = {
  config: TemplateFirstConfig<T>;
  initialSeed?: StudioSeed;
};

function defaultInputs(template: StudioClientTemplate): Record<string, string> {
  return Object.fromEntries(template.firstUseInputs.map((fi) => [fi.id, fi.default ?? ""]));
}

export default function TemplateFirstStudioClient<T extends StudioClientTemplate>({
  config,
  initialSeed,
}: Props<T>) {
  const router = useRouter();
  const pathname = usePathname();
  const seededTemplate =
    initialSeed ? config.templates.find((t) => t.id === initialSeed.templateId) : undefined;

  // Inputs the configuring form binds to. Seeded from the template defaults,
  // overlaid with any seed inputs (the ?rerun= path carries real inputs).
  const seededInputs = seededTemplate
    ? { ...defaultInputs(seededTemplate), ...(initialSeed?.inputs ?? {}) }
    : {};

  const [stage, setStage] = useState<Stage<T>>(() =>
    seededTemplate && initialSeed
      ? { kind: "configuring", template: seededTemplate, task: initialSeed.task, inputs: seededInputs }
      : { kind: "idle" },
  );
  const [task, setTask] = useState(initialSeed?.task ?? "");
  const [selected, setSelected] = useState<T | null>(seededTemplate ?? null);
  const [inputs, setInputs] = useState<Record<string, string>>(seededInputs);
  const [error, setError] = useState<string | null>(null);
  const [reviewed, setReviewed] = useState<"accepted" | "rejected" | null>(null);
  const [pending, startTransition] = useTransition();

  const taskMax = TASK_MAX_LEN[config.role];

  // Once the user diverges from a ?template= deep link, strip the stale params
  // so a refresh/back doesn't resurrect them. Editing the task in place needs
  // no rewrite -- the seed task is only read on mount.
  const clearDeepLink = () => {
    if (initialSeed) router.replace(pathname);
  };

  const pickTemplate = (t: T) => {
    setError(null);
    setSelected(t);
    const seeded = defaultInputs(t);
    setInputs(seeded);
    setStage({ kind: "configuring", template: t, task, inputs: seeded });
    if (initialSeed && t.id !== initialSeed.templateId) clearDeepLink();
  };

  // configuring -> plan-confirming. Previews intent + candidate memory. The
  // shared previewPlan validates like the run action; it does NOT call the LLM.
  const requestPlan = () => {
    if (!selected) return;
    setError(null);
    const runTask = task;
    const runInputs = inputs;
    startTransition(async () => {
      const res = await previewPlan(selected.id, runTask, runInputs);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setStage({ kind: "plan-confirming", template: selected, task: runTask, inputs: runInputs, plan: res.plan });
    });
  };

  // plan-confirming -> running -> reviewing. The actual generation.
  const confirmPlan = () => {
    if (stage.kind !== "plan-confirming") return;
    const { template, task: runTask, inputs: runInputs } = stage;
    setError(null);
    setStage({ kind: "running", template, task: runTask });
    startTransition(async () => {
      const res = await config.runWorkflow(template.id, runTask, runInputs);
      if (!res.ok) {
        setError(res.error);
        setStage({ kind: "configuring", template, task: runTask, inputs: runInputs });
        return;
      }
      setReviewed(null);
      setStage({
        kind: "reviewing",
        template,
        task: runTask,
        blocks: res.blocks,
        cited: res.citedMemories,
        runId: res.runId,
      });
    });
  };

  const backToConfigure = () => {
    if (stage.kind !== "plan-confirming") return;
    setStage({ kind: "configuring", template: stage.template, task: stage.task, inputs: stage.inputs });
  };

  const reset = () => {
    setStage({ kind: "idle" });
    setSelected(null);
    setInputs({});
    setTask("");
    setError(null);
    setReviewed(null);
    clearDeepLink();
  };

  // ---- empty-state guard ----
  if (config.templates.length === 0) {
    return (
      <section className="rounded-lg border border-dashed border-border p-8 text-center">
        <div className="font-medium">No {config.role} workflows yet</div>
        <p className="mt-2 text-sm text-muted-foreground">
          Templates land here one at a time. Check back as they ship.
        </p>
      </section>
    );
  }

  // ---- focused stages (replace the whole surface) ----
  if (stage.kind === "plan-confirming") {
    return (
      <div className="space-y-4">
        {error ? <ErrorBanner message={error} /> : null}
        <PlanConfirmStage
          plan={stage.plan}
          onConfirm={confirmPlan}
          onBack={backToConfigure}
          disabled={pending}
        />
      </div>
    );
  }

  if (stage.kind === "running") {
    return (
      <section className="rounded-lg border border-border p-5">
        <div className="text-sm text-muted-foreground">
          Drafting {stage.template.label.toLowerCase()}… reading your brain.
        </div>
        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted">
          <div className="h-full w-1/3 animate-pulse bg-foreground/60" />
        </div>
      </section>
    );
  }

  if (stage.kind === "reviewing") {
    return (
      <ReviewView
        config={config}
        template={stage.template}
        task={stage.task}
        blocks={stage.blocks}
        cited={stage.cited}
        runId={stage.runId}
        reviewed={reviewed}
        setReviewed={setReviewed}
        error={error}
        setError={setError}
        pending={pending}
        startTransition={startTransition}
        onReset={reset}
      />
    );
  }

  // ---- idle / configuring / error: task textarea + grid + configuring form ----
  const canPick = task.trim().length >= TASK_MIN_LEN;
  return (
    <div className="space-y-8">
      {error ? <ErrorBanner message={error} /> : null}

      <section className="studio-composer">
        <label className="studio-composer-label" htmlFor="studio-task-input">
          {config.copy.taskLabel}
        </label>
        <div className="studio-composer-shell" data-disabled={pending || undefined}>
          <textarea
            id="studio-task-input"
            className="studio-composer-input"
            placeholder={config.copy.taskPlaceholder}
            value={task}
            onChange={(e) => setTask(e.target.value)}
            disabled={pending}
            rows={3}
          />
          <div className="studio-composer-foot">
            <span className="studio-composer-count" data-near-limit={task.length > taskMax * 0.9 || undefined}>
              {task.length.toLocaleString()} / {taskMax.toLocaleString()}
            </span>
            <span className="studio-composer-hint" aria-hidden>
              {canPick ? "Pick a workflow below ↓" : `${TASK_MIN_LEN}+ characters to continue`}
            </span>
          </div>
        </div>
      </section>

      <section>
        <div className="studio-grid-head">
          <h2 className="studio-grid-title">Pick a workflow</h2>
          <span className="studio-grid-count">{config.templates.length} options</span>
        </div>
        <div className="studio-grid">
          {config.templates.map((t) => {
            const isSelected = selected?.id === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => pickTemplate(t)}
                disabled={pending || !canPick}
                className={"studio-tpl-card" + (isSelected ? " is-selected" : "")}
              >
                <span className="studio-tpl-glyph" aria-hidden>
                  <TemplateKindGlyph kind={t.kind} />
                </span>
                <span className="studio-tpl-title">
                  <span>{t.label}</span>
                  {config.templateBadge?.(t)}
                </span>
                <p className="studio-tpl-hint">{t.hint}</p>
                <span className="studio-tpl-foot">
                  <span className="studio-tpl-pill">{kindLabel(t.kind)}</span>
                  <span className="studio-tpl-arrow" aria-hidden>→</span>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {stage.kind === "configuring" && selected ? (
        <section className="rounded-lg border border-border p-5 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="font-medium">{selected.label}</div>
              <div className="text-xs text-muted-foreground mt-1">{selected.hint}</div>
            </div>
            {config.overrides ? (
              <ActiveOverridesPill
                templateId={selected.id}
                listAction={config.overrides.listAction}
                deactivateAction={config.overrides.deactivateAction}
              />
            ) : null}
          </div>

          {config.templateConfigureNote?.(selected)}

          {selected.firstUseInputs.map((fi) => (
            <div key={fi.id}>
              <label className="block text-sm font-medium mb-1">
                {fi.label}
                {fi.required ? <span className="text-red-500 ml-1">*</span> : null}
              </label>
              <p className="text-xs text-muted-foreground mb-2">{fi.hint}</p>
              {fi.kind === "select" || fi.kind === "tone" ? (
                <select
                  className="w-full rounded-md border border-input bg-background p-2 text-sm"
                  value={inputs[fi.id] ?? ""}
                  onChange={(e) => setInputs((s) => ({ ...s, [fi.id]: e.target.value }))}
                  disabled={pending}
                >
                  {!fi.required && !fi.default ? <option value="">—</option> : null}
                  {(fi.options ?? []).map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              ) : (
                <textarea
                  className="w-full min-h-[60px] rounded-md border border-input bg-background p-2 text-sm"
                  value={inputs[fi.id] ?? ""}
                  onChange={(e) => setInputs((s) => ({ ...s, [fi.id]: e.target.value }))}
                  disabled={pending}
                />
              )}
            </div>
          ))}

          <div className="flex items-center gap-3 pt-2">
            <Button onClick={requestPlan} disabled={pending || !canSubmit(selected, inputs, task)}>
              {pending ? "Working…" : config.copy.generateLabel}
            </Button>
            <button
              type="button"
              onClick={reset}
              className="text-xs text-muted-foreground hover:text-foreground"
              disabled={pending}
            >
              Reset
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function canSubmit(
  t: StudioClientTemplate,
  inputs: Record<string, string>,
  task: string,
): boolean {
  if (task.trim().length < TASK_MIN_LEN) return false;
  for (const fi of t.firstUseInputs) {
    if (fi.required && !(inputs[fi.id] ?? "").trim()) return false;
  }
  return true;
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="rounded-lg border border-destructive/40 bg-destructive/5 text-destructive px-4 py-3 text-sm"
    >
      {message}
    </div>
  );
}

function ReviewView<T extends StudioClientTemplate>({
  config,
  template,
  task,
  blocks,
  cited,
  runId,
  reviewed,
  setReviewed,
  error,
  setError,
  pending,
  startTransition,
  onReset,
}: {
  config: TemplateFirstConfig<T>;
  template: T;
  task: string;
  blocks: OutputBlock[];
  cited: CitedMemory[];
  runId: string;
  reviewed: "accepted" | "rejected" | null;
  setReviewed: (r: "accepted" | "rejected" | null) => void;
  error: string | null;
  setError: (e: string | null) => void;
  pending: boolean;
  startTransition: (cb: () => void) => void;
  onReset: () => void;
}) {
  const review = config.review;
  const editChat = config.overrides ? (
    <EditWorkflowChat
      templateId={template.id}
      templateLabel={template.label}
      sourceRunId={runId}
      proposeAction={config.overrides.proposeAction}
      saveAction={config.overrides.saveAction}
    />
  ) : null;

  if (review.kind === "full") {
    const decide = (action: (id: string) => Promise<{ ok: true } | { ok: false; error: string }>, outcome: "accepted" | "rejected") => {
      setError(null);
      startTransition(async () => {
        const res = await action(runId);
        if (!res.ok) {
          setError(res.error);
          return;
        }
        setReviewed(outcome);
      });
    };
    return (
      <section className="space-y-4">
        {error ? <ErrorBanner message={error} /> : null}
        <div className="flex items-center justify-between">
          <div className="text-xs font-semibold tracking-[0.16em] uppercase text-muted-foreground">
            Output
          </div>
          {editChat}
        </div>
        <OutputBlocks blocks={blocks} citedMemories={cited} authorHint={review.authorHint} />
        <div className="flex items-center justify-between gap-3 rounded-2xl border bg-card px-4 py-3">
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
              <Button variant="studio" onClick={onReset}>
                New task
              </Button>
            ) : (
              <>
                <Button
                  variant="ghost"
                  onClick={() => decide(review.rejectAction, "rejected")}
                  disabled={pending}
                >
                  Reject
                </Button>
                <Button
                  variant="studio"
                  onClick={() => decide(review.acceptAction, "accepted")}
                  disabled={pending}
                >
                  Approve
                </Button>
              </>
            )}
          </div>
        </div>
      </section>
    );
  }

  // light review: edit-chat + "New run"
  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between gap-3">
        <div>
          <div className="text-xs text-muted-foreground uppercase tracking-wide flex items-center gap-2">
            <span>{template.label}</span>
            {config.overrides ? (
              <ActiveOverridesPill
                templateId={template.id}
                listAction={config.overrides.listAction}
                deactivateAction={config.overrides.deactivateAction}
              />
            ) : null}
          </div>
          <h2 className="text-lg font-medium mt-1">{task}</h2>
        </div>
        <div className="flex items-center gap-2">
          {editChat}
          <Button variant="outline" onClick={onReset}>
            New run
          </Button>
        </div>
      </header>
      <OutputBlocks blocks={blocks} citedMemories={cited} />
    </div>
  );
}
