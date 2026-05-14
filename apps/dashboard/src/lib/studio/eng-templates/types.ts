// Engineering Studio template contract. Reuses the marketing template types
// where the shape matches; adds eng-flavored prompt helpers. Output is always
// a `plain` block carrying markdown (ADRs, proposals, reviews) -- engineering
// deliverables are documents, not platform cards.

import type {
  Template,
  FirstUseInput,
  BrainSummary,
  BuildPromptArgs,
  OverrideRule,
} from "../templates/types";

export type { Template, FirstUseInput, BrainSummary, BuildPromptArgs, OverrideRule };

// Format the recent decisions section for an eng prompt. Engineering templates
// lean heavily on prior decisions -- this is the "what has the company already
// decided" context an ADR or proposal must respect.
export function decisionsClause(decisions: BrainSummary["recent_decisions"]): string {
  if (!decisions || decisions.length === 0) return "Prior decisions: (none recorded).";
  const lines = decisions.slice(0, 5).map((d) => `- ${d.title}: ${d.decision}`);
  return `Prior decisions (cite mem_id when material):\n${lines.join("\n")}`;
}

export function vendorsClause(vendors: BrainSummary["vendors"]): string {
  if (!vendors || vendors.length === 0) return "Vendors: (none recorded).";
  const lines = vendors.slice(0, 8).map((v) => `- ${v.name} (${v.role})`);
  return `Active vendors:\n${lines.join("\n")}`;
}

export const ENG_CITATION_INSTRUCTION = `
Inline memory citations: whenever a sentence is materially shaped by a specific
memory in the brain (a prior decision, an active vendor, a team member),
append a citation tag with the memory's id, e.g. "we already decided to use
PostgreSQL<cite mem_id="..."/>". Use the exact uuid from the brain context.
Never invent ids. 1-5 citations per document is typical.
`.trim();

export const OUTPUT_AS_PLAIN_MARKDOWN = `
Output as a single tool_use call with one OutputBlock of kind 'plain' and
props { text: string }. The text field is the full markdown document.
Use standard Markdown: # headings, **bold**, lists, fenced code blocks.
`.trim();
