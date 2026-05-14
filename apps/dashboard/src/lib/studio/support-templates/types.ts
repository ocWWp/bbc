// Support Studio template contract. Mirrors eng-templates/types.ts but
// re-exports the marketing voiceClause/overridesClause (support replies are
// voice-heavy) and adds a glossaryClause helper that pins canonical product
// nouns/verbs. Output is always a `plain` block carrying markdown -- a support
// reply lives inside an existing thread (Help Scout, Front, Gmail), so a typed
// email_reply kind with subject+body would be wrong for v1.

import type {
  Template,
  FirstUseInput,
  BrainSummary,
  BuildPromptArgs,
  OverrideRule,
} from "../templates/types";

export type { Template, FirstUseInput, BrainSummary, BuildPromptArgs, OverrideRule };

// Re-export the marketing voice + overrides clause helpers. Support replies
// inherit the same voice contract as marketing copy; no reason to duplicate.
export { voiceClause, overridesClause, CITATION_INSTRUCTION } from "../templates/types";

// Format the glossary section for a support prompt. Canonical terms the model
// must use exactly -- "labels not tags", "brain not knowledge base" -- so the
// reply doesn't drift from product vocabulary. Capped to keep the prompt tight.
//
// Each line leads with the memory's uuid in [brackets] so the model can emit a
// valid <cite mem_id="..."/> tag -- without the id in context the citation
// contract is dead (validateRun drops any id the model never actually saw).
export function glossaryClause(glossary: BrainSummary["glossary"]): string {
  if (!glossary || glossary.terms.length === 0) return "Glossary: (none recorded).";
  const lines = glossary.terms
    .slice(0, 12)
    .map((g) => `- [${g.id}] ${g.term}: ${g.definition}`);
  return `Canonical product vocabulary (use these terms exactly, do not rephrase; cite the bracketed mem_id when material):\n${lines.join("\n")}`;
}

// Format the decisions section for a support prompt. Used by churn-save,
// bug-ack, feature-request-triage to surface "we don't do X" rules. Shorter
// than the engineering equivalent -- support replies cite 1-2 decisions at
// most, not the full ADR history.
export function supportDecisionsClause(decisions: BrainSummary["recent_decisions"]): string {
  if (!decisions || decisions.length === 0) return "Prior decisions: (none recorded).";
  const lines = decisions.slice(0, 4).map((d) => `- [${d.id}] ${d.title}: ${d.decision}`);
  return `Prior decisions (cite the bracketed mem_id when material to the reply):\n${lines.join("\n")}`;
}

// Format the product clause for a support prompt. Grounds the model in what
// the product actually is so it doesn't invent features when answering.
export function productClause(product: BrainSummary["product"]): string {
  if (!product) return "Product: (positioning not recorded).";
  const diffs = product.differentiators.slice(0, 3);
  const diffLine = diffs.length ? `\nDifferentiators: ${diffs.join("; ")}.` : "";
  return `Product positioning: ${product.positioning}\nTarget user: ${product.target_user}.${diffLine}`;
}

export const OUTPUT_AS_PLAIN_MARKDOWN = `
Output as a single tool_use call with one OutputBlock of kind 'plain' and
props { text: string }. The text field is the reply body as markdown.
Do NOT include an email-shaped Subject: line -- the founder is responding
inside an existing thread (Help Scout, Front, Gmail reply, in-app chat).
`.trim();
