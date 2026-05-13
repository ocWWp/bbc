"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { EditWorkflowChat } from "@/components/studio/EditWorkflowChat";
import { ActiveOverridesPill } from "@/components/studio/ActiveOverridesPill";
import type { OutputBlock } from "@/lib/studio/output-blocks";
import type { ClientEngTemplate } from "@/lib/studio/eng-templates/registry";
import { CitationChip } from "@/components/studio/CitationChip";
import {
  deactivateEngStudioOverride,
  listActiveEngOverrides,
  proposeEngOverride,
  runEngineeringWorkflow,
  saveEngStudioTemplateOverride,
  type CitedMemoryRef,
} from "./actions";

export type RecentEngRun = {
  id: string;
  templateId: string;
  task: string;
  inputs: Record<string, string>;
  status: string;
  createdAt: string;
};

type Props = {
  templates: ClientEngTemplate[];
  recentRuns: RecentEngRun[];
};

type Stage =
  | { kind: "idle" }
  | { kind: "configuring"; template: ClientEngTemplate; task: string }
  | { kind: "running"; template: ClientEngTemplate; task: string }
  | {
      kind: "reviewing";
      template: ClientEngTemplate;
      task: string;
      blocks: OutputBlock[];
      cited: CitedMemoryRef[];
      runId: string;
    }
  | { kind: "error"; message: string };

export default function EngStudioClient({ templates, recentRuns }: Props) {
  const [stage, setStage] = useState<Stage>({ kind: "idle" });
  const [task, setTask] = useState("");
  const [selected, setSelected] = useState<ClientEngTemplate | null>(null);
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  const pickTemplate = (t: ClientEngTemplate) => {
    setSelected(t);
    setInputs(
      Object.fromEntries(
        t.firstUseInputs.map((fi) => [fi.id, fi.default ?? ""]),
      ),
    );
    setStage({ kind: "configuring", template: t, task });
  };

  const run = () => {
    if (!selected) return;
    setStage({ kind: "running", template: selected, task });
    startTransition(async () => {
      const res = await runEngineeringWorkflow(selected.id, task, inputs);
      if (!res.ok) {
        setStage({ kind: "error", message: res.error });
        return;
      }
      setStage({
        kind: "reviewing",
        template: selected,
        task,
        blocks: res.blocks,
        cited: res.citedMemories,
        runId: res.runId,
      });
    });
  };

  const reset = () => {
    setStage({ kind: "idle" });
    setSelected(null);
    setInputs({});
    setTask("");
  };

  if (stage.kind === "reviewing") {
    return (
      <ReviewView
        template={stage.template}
        task={stage.task}
        blocks={stage.blocks}
        cited={stage.cited}
        runId={stage.runId}
        onReset={reset}
      />
    );
  }

  return (
    <div className="space-y-8">
      <section>
        <label className="block text-sm font-medium mb-2">
          What are you working on?
        </label>
        <textarea
          className="w-full min-h-[100px] rounded-md border border-input bg-background p-3 text-sm"
          placeholder="e.g. We're deciding whether to keep Vercel or move to Cloudflare Workers for the dashboard."
          value={task}
          onChange={(e) => setTask(e.target.value)}
          disabled={pending}
        />
        <p className="mt-1 text-xs text-muted-foreground">
          {task.length} / 600 chars
        </p>
      </section>

      <section>
        <h2 className="text-sm font-semibold tracking-wide uppercase text-muted-foreground mb-3">
          Pick a workflow
        </h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {templates.map((t) => {
            const isSelected = selected?.id === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => pickTemplate(t)}
                disabled={pending || task.trim().length < 8}
                className={
                  "text-left rounded-lg border p-4 transition-colors " +
                  (isSelected
                    ? "border-foreground bg-accent"
                    : "border-border hover:bg-accent/50") +
                  " disabled:opacity-50 disabled:cursor-not-allowed"
                }
              >
                <div className="font-medium">{t.label}</div>
                <div className="mt-1 text-xs text-muted-foreground">{t.hint}</div>
              </button>
            );
          })}
        </div>
        {task.trim().length < 8 && (
          <p className="mt-2 text-xs text-muted-foreground">
            Describe the task first, then pick a workflow.
          </p>
        )}
      </section>

      {stage.kind === "configuring" && selected && (
        <section className="rounded-lg border border-border p-5 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="font-medium">{selected.label}</div>
              <div className="text-xs text-muted-foreground mt-1">{selected.hint}</div>
            </div>
            <ActiveOverridesPill
              templateId={selected.id}
              listAction={listActiveEngOverrides}
              deactivateAction={deactivateEngStudioOverride}
            />
          </div>
          {selected.firstUseInputs.map((fi) => (
            <div key={fi.id}>
              <label className="block text-sm font-medium mb-1">
                {fi.label}
                {fi.required && <span className="text-red-500 ml-1">*</span>}
              </label>
              <p className="text-xs text-muted-foreground mb-2">{fi.hint}</p>
              <textarea
                className="w-full min-h-[60px] rounded-md border border-input bg-background p-2 text-sm"
                value={inputs[fi.id] ?? ""}
                onChange={(e) => setInputs((s) => ({ ...s, [fi.id]: e.target.value }))}
                disabled={pending}
              />
            </div>
          ))}
          <div className="flex items-center gap-3 pt-2">
            <Button onClick={run} disabled={pending || !canRun(selected, inputs, task)}>
              {pending ? "Generating…" : "Generate"}
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
      )}

      {stage.kind === "running" && (
        <section className="rounded-lg border border-border p-5">
          <div className="text-sm text-muted-foreground">
            Drafting {stage.template.label.toLowerCase()}… Sonnet is reading your brain.
          </div>
          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full w-1/3 animate-pulse bg-foreground/60" />
          </div>
        </section>
      )}

      {stage.kind === "error" && (
        <section className="rounded-lg border border-red-500/40 bg-red-500/5 p-5 space-y-2">
          <div className="font-medium">Generation failed</div>
          <div className="text-sm text-muted-foreground">{stage.message}</div>
          <Button variant="outline" onClick={reset}>
            Try again
          </Button>
        </section>
      )}

      {recentRuns.length > 0 && stage.kind === "idle" && (
        <section className="pt-6 border-t border-border">
          <h2 className="text-sm font-semibold tracking-wide uppercase text-muted-foreground mb-3">
            Recent runs
          </h2>
          <ul className="space-y-2">
            {recentRuns.map((r) => (
              <li key={r.id} className="text-sm">
                <span className="text-muted-foreground">{r.templateId}</span>
                <span className="mx-2">·</span>
                <span>{r.task.slice(0, 100)}</span>
                <span className="ml-2 text-xs text-muted-foreground">
                  ({r.status})
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function canRun(
  t: ClientEngTemplate,
  inputs: Record<string, string>,
  task: string,
): boolean {
  if (task.trim().length < 8) return false;
  for (const fi of t.firstUseInputs) {
    if (fi.required && !(inputs[fi.id] ?? "").trim()) return false;
  }
  return true;
}

function ReviewView({
  template,
  task,
  blocks,
  cited,
  runId,
  onReset,
}: {
  template: ClientEngTemplate;
  task: string;
  blocks: OutputBlock[];
  cited: CitedMemoryRef[];
  runId: string;
  onReset: () => void;
}) {
  const text = blocks
    .map((b) => {
      if (b.kind === "plain") return b.props.text;
      if (b.kind === "blog_draft") return b.props.body_markdown;
      return JSON.stringify(b, null, 2);
    })
    .join("\n\n");

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between gap-3">
        <div>
          <div className="text-xs text-muted-foreground uppercase tracking-wide flex items-center gap-2">
            <span>{template.label}</span>
            <ActiveOverridesPill
              templateId={template.id}
              listAction={listActiveEngOverrides}
              deactivateAction={deactivateEngStudioOverride}
            />
          </div>
          <h2 className="text-lg font-medium mt-1">{task}</h2>
        </div>
        <div className="flex items-center gap-2">
          <EditWorkflowChat
            templateId={template.id}
            templateLabel={template.label}
            sourceRunId={runId}
            proposeAction={proposeEngOverride}
            saveAction={saveEngStudioTemplateOverride}
          />
          <Button variant="outline" onClick={onReset}>
            New run
          </Button>
        </div>
      </header>

      <article className="prose prose-sm max-w-none dark:prose-invert rounded-lg border border-border bg-background p-6">
        <pre className="whitespace-pre-wrap font-mono text-sm">{text}</pre>
      </article>

      {cited.length > 0 && (
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            Cited memories ({cited.length})
          </h3>
          <ul className="flex flex-wrap gap-2">
            {cited.map((c, i) => (
              <li key={c.id}>
                <CitationChip
                  memoryId={c.id}
                  type={c.type}
                  label={c.title}
                  citationNumber={i + 1}
                />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
