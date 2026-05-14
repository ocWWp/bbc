// The plan-before-run preview shape. Lifted out of marketing/actions.ts so a
// client component (PlanConfirmStage) can import the type without pulling in a
// route's server-action module. marketing/actions.ts re-exports this for
// callers that already import from there.

export type PlanPreview = {
  templateId: string;
  templateLabel: string;
  task: string;
  inputs: Record<string, string>;
  planSummary: string; // plain-language, human-readable
  // Brain rows in scope for this run -- intended retrieval scope, NOT final
  // citations. Covers the id-bearing memory types only.
  candidateMemories: Array<{ id: string; kind: string; label: string }>;
  // Always-on context the run inherits regardless of the task. voice and
  // product memory feed every template's prompt but carry no id, so they are
  // surfaced here rather than as itemized candidateMemories. Display labels,
  // e.g. ["Voice", "Product positioning"].
  alwaysOnContext: string[];
};
