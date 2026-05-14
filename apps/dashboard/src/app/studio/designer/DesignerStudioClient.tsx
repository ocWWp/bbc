"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import type { OutputBlock } from "@/lib/studio/output-blocks";
import type { ClientDesignerTemplate } from "@/lib/studio/designer-templates/registry";
import { runDesignerWorkflow, type CitedMemoryRef } from "./actions";
import { OutputBlocks } from "@/components/studio/OutputBlocks";

type Props = {
  templates: ClientDesignerTemplate[];
};

type Stage =
  | { kind: "idle" }
  | { kind: "configuring"; template: ClientDesignerTemplate; task: string }
  | { kind: "running"; template: ClientDesignerTemplate; task: string }
  | {
      kind: "reviewing";
      template: ClientDesignerTemplate;
      task: string;
      blocks: OutputBlock[];
      cited: CitedMemoryRef[];
      runId: string;
    }
  | { kind: "error"; message: string };

export default function DesignerStudioClient({ templates }: Props) {
  const [stage, setStage] = useState<Stage>({ kind: "idle" });
  const [task, setTask] = useState("");
  const [selected, setSelected] = useState<ClientDesignerTemplate | null>(null);
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  const pickTemplate = (t: ClientDesignerTemplate) => {
    setSelected(t);
    setInputs(
      Object.fromEntries(t.firstUseInputs.map((fi) => [fi.id, fi.default ?? ""])),
    );
    setStage({ kind: "configuring", template: t, task });
  };

  const run = () => {
    if (!selected) return;
    setStage({ kind: "running", template: selected, task });
    startTransition(async () => {
      const res = await runDesignerWorkflow(selected.id, task, inputs);
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
          placeholder="e.g. The empty state on /memory currently says 'no items yet' — needs a designer pass."
          value={task}
          onChange={(e) => setTask(e.target.value)}
          disabled={pending}
        />
        <p className="mt-1 text-xs text-muted-foreground">
          {task.length} / 800 chars
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
          <div>
            <div className="font-medium">{selected.label}</div>
            <div className="text-xs text-muted-foreground mt-1">{selected.hint}</div>
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
            Drafting {stage.template.label.toLowerCase()}… reading your brain.
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

    </div>
  );
}

function canRun(
  t: ClientDesignerTemplate,
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
  onReset,
}: {
  template: ClientDesignerTemplate;
  task: string;
  blocks: OutputBlock[];
  cited: CitedMemoryRef[];
  onReset: () => void;
}) {
  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <div className="text-xs text-muted-foreground uppercase tracking-wide">
            {template.label}
          </div>
          <h2 className="text-lg font-medium mt-1">{task}</h2>
        </div>
        <Button variant="outline" onClick={onReset}>
          New run
        </Button>
      </header>

      <OutputBlocks blocks={blocks} citedMemories={cited} />
    </div>
  );
}
