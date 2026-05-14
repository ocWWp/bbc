// Finance Studio template contract. Reuses the marketing template types
// where the shape matches; adds finance-flavored prompt helpers. Output is
// always a `doc` block (board financials, budget memos, runway analyses) --
// finance deliverables are structured documents, not platform cards.

import type {
  Template,
  FirstUseInput,
  BrainSummary,
  BuildPromptArgs,
  OverrideRule,
} from "../templates/types";

export type { Template, FirstUseInput, BrainSummary, BuildPromptArgs, OverrideRule };

// Merge active tenant customizations into the prompt body. Finance reuses the
// marketing helper unchanged -- an override rule is role-agnostic.
export { overridesClause } from "../templates/types";

// Prior decisions section. Finance documents lean on what the company has
// already committed to (a hiring plan, a fundraise target, a pricing change)
// because the numbers only mean something against those decisions.
//
// Each line leads with the memory's uuid in [brackets] so the model can emit
// a valid <cite mem_id="..."/> tag -- without the id in context, the citation
// contract is dead (validateRun drops any id the model didn't actually see).
export function decisionsClause(decisions: BrainSummary["recent_decisions"]): string {
  if (!decisions || decisions.length === 0) return "Prior decisions: (none recorded).";
  const lines = decisions.slice(0, 5).map((d) => `- [${d.id}] ${d.title}: ${d.decision}`);
  return `Prior decisions (cite the bracketed mem_id when material):\n${lines.join("\n")}`;
}

export function vendorsClause(vendors: BrainSummary["vendors"]): string {
  if (!vendors || vendors.length === 0) return "Vendors: (none recorded).";
  const lines = vendors.slice(0, 8).map((v) => `- [${v.id}] ${v.name} (${v.role})`);
  return `Active vendors (recurring spend lives here; cite the bracketed mem_id when material):\n${lines.join("\n")}`;
}

// Metrics & actuals section. No memory type populates BrainSummary.metrics
// yet, so this almost always renders the "(none recorded)" line -- the
// finance Studio then asks the user for the numbers in the prompt inputs.
export function metricsClause(metrics: BrainSummary["metrics"]): string {
  if (!metrics || metrics.length === 0) {
    return "Metrics & actuals from memory: (none recorded -- use only the numbers the user gives you below; never invent figures).";
  }
  const lines = metrics.slice(0, 8).map((m) => `- [${m.id}] ${m.label}: ${m.value}`);
  return `Metrics & actuals from memory (cite the bracketed mem_id when material):\n${lines.join("\n")}`;
}

export const FINANCE_CITATION_INSTRUCTION = `
Inline memory citations: whenever a sentence is materially shaped by a specific
memory in the brain (a prior decision, an active vendor, a recorded metric),
append a citation tag with the memory's id, e.g. "the board approved the
Series A target<cite mem_id="..."/>". Use the exact uuid from the brain
context. Never invent ids. 1-5 citations per document is typical.
`.trim();

// Every finance template emits one `doc` OutputBlock. The whole document goes
// in body_markdown; `sections` is left unset (DocCard typesets the markdown).
export function outputAsDoc(docType: string): string {
  return `
Output as a single tool_use call with one OutputBlock of kind 'doc' and props:
  {
    "title": "<the document's title>",
    "doc_type": "${docType}",
    "body_markdown": "<the full document as Markdown>"
  }
Do NOT set "sections" -- put the entire document in body_markdown. Use standard
Markdown: # headings, **bold**, bullet lists, and tables for any numbers.
`.trim();
}

// Shared framing for every finance document: numbers are the easy part, the
// narrative around them is the deliverable. This is the Finance Studio wedge.
export const FINANCE_NARRATIVE_CONTRACT = `
This is the Finance Studio's core contract -- follow it in every section:
- Show your work. State the assumption behind every derived number so a
  reader can check it. Never present a figure without saying where it came from.
- Separate timing from structural. When something moved, tag whether it's a
  timing effect (a bill landed early, revenue slipped a week) or a structural
  change (burn is permanently higher, a new hire is on payroll). Reviewers
  need this distinction to act.
- Never invent figures. Use only the numbers in memory or the numbers the user
  provided. If a number you need is missing, say so explicitly and list it
  under "Open questions" -- do not estimate it into the document.
- Lead with what-it-means, not the ledger. A reader should get the takeaway
  in the first paragraph; the supporting math comes after.
`.trim();
