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
  // citations. Covers the id-bearing memory types; voice/product are always-on
  // context and are not itemized here.
  candidateMemories: Array<{ id: string; kind: string; label: string }>;
};
