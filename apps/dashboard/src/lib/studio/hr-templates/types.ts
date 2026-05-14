// People/HR Studio template contract. Reuses the marketing template types
// where the shape matches; adds HR-flavored prompt helpers. Output is always
// a `doc` block (job descriptions, offer letters, onboarding plans, reviews)
// -- HR deliverables are structured documents, not platform cards.
//
// THE ONE THING (UI-SPEC §2, People/HR): behavior-anchored scaffolding plus
// bias/sensitivity flagging. Every helper + the run system prompt enforce:
// describe observable behavior never personality traits, flag biased or
// exclusionary language, and loop in counsel for anything with legal exposure.

import type {
  Template,
  FirstUseInput,
  BrainSummary,
  BuildPromptArgs,
  OverrideRule,
} from "../templates/types";

export type { Template, FirstUseInput, BrainSummary, BuildPromptArgs, OverrideRule };

// Merge active tenant customizations into the prompt body. HR reuses the
// marketing helper unchanged -- an override rule is role-agnostic.
export { overridesClause } from "../templates/types";

// Each clause leads every line with the memory's uuid in [brackets] so the
// model can emit a valid <cite mem_id="..."/> tag -- without the id in
// context the citation contract is dead (validateRun drops unseen ids).

export function teamClause(team: BrainSummary["team"]): string {
  if (!team || team.length === 0) return "Team: (none recorded).";
  const lines = team.slice(0, 8).map((m) => `- [${m.id}] ${m.name} (${m.role})`);
  return `Current team (cite the bracketed mem_id when you reference a person or a role precedent):\n${lines.join("\n")}`;
}

export function decisionsClause(decisions: BrainSummary["recent_decisions"]): string {
  if (!decisions || decisions.length === 0) return "Prior decisions: (none recorded).";
  const lines = decisions.slice(0, 5).map((d) => `- [${d.id}] ${d.title}: ${d.decision}`);
  return `Prior decisions (hiring plans, comp philosophy, org choices — cite the bracketed mem_id when material):\n${lines.join("\n")}`;
}

export function glossaryClause(glossary: BrainSummary["glossary"]): string {
  const terms = glossary?.terms ?? [];
  if (terms.length === 0) return "Glossary: (none recorded).";
  const lines = terms.slice(0, 6).map((t) => `- [${t.id}] ${t.term}: ${t.definition}`);
  return `Defined terms (use these spellings exactly; cite the bracketed mem_id when material):\n${lines.join("\n")}`;
}

// Comp bands section. No memory type populates BrainSummary.comp_bands yet, so
// this almost always renders the "(none recorded)" line -- the comp-band
// templates then ask the user for the ranges in the prompt inputs.
export function compBandsClause(compBands: BrainSummary["comp_bands"]): string {
  if (!compBands || compBands.length === 0) {
    return "Comp bands from memory: (none recorded -- use only the ranges the user gives you below; never invent salary numbers).";
  }
  const lines = compBands.slice(0, 8).map((c) => `- [${c.id}] ${c.label}: ${c.range}`);
  return `Comp bands from memory (cite the bracketed mem_id when material):\n${lines.join("\n")}`;
}

export const HR_CITATION_INSTRUCTION = `
Inline memory citations: whenever a sentence is materially shaped by a specific
memory in the brain (a team member, a prior decision, a defined term, a comp
band), append a citation tag with the memory's id, e.g. "reporting to the
Head of Product<cite mem_id="..."/>". Use the exact uuid from the brain
context. Never invent ids. 1-4 citations per document is typical.
`.trim();

// The contract baked into every HR template + the run system prompt.
export const HR_SENSITIVITY_CONTRACT = `
PEOPLE/HR STUDIO CONTRACT — follow it in every section:
- Behavior-anchored, always. Every expectation, requirement, or review
  criterion describes an observable behavior or outcome — never a personality
  trait. "Writes design docs that teammates can act on without a meeting", not
  "good communicator". "Ships and unblocks others", not "team player".
- Flag biased or exclusionary language. Watch for gendered terms, age-coded
  words ("digital native", "energetic", "recent grad"), culture-fit framing,
  ableist phrasing, and unnecessary degree or years-of-experience gates. If
  any appear in the user's input, rewrite them and note what you changed.
- Inclusive by default. List only genuine must-haves as requirements; label
  everything else "nice to have". Long requirement lists deter qualified
  applicants, women especially.
- Know the line. This Studio drafts HR documents; it does not give
  employment-law or legal advice. When a document touches termination,
  performance management, leave, accommodation, immigration, or pay equity,
  add a "**Loop in counsel**" callout pointing the user to the Legal Studio
  or an employment attorney before they act on it.
- Every output is a draft for a human to review, personalize, and own.
`.trim();

// Every HR template emits one `doc` OutputBlock. The whole document goes in
// body_markdown; `sections` is left unset (DocCard typesets the markdown).
export function outputAsDoc(docType: string): string {
  return `
Output as a single tool_use call with one OutputBlock of kind 'doc' and props:
  {
    "title": "<the document's title>",
    "doc_type": "${docType}",
    "body_markdown": "<the full document as Markdown>"
  }
Do NOT set "sections" -- put the entire document in body_markdown. Use standard
Markdown: # headings, **bold**, lists, tables, and [BRACKETED] placeholders for
values the user must personalize (names, dates, salary numbers).
`.trim();
}
