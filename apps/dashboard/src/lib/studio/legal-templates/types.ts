// Legal Studio template contract. Reuses the marketing template types where
// the shape matches; adds legal-flavored prompt helpers. Output is always a
// `doc` block (NDAs, agreements, policies) -- legal deliverables are
// structured documents, not platform cards.
//
// THE HARD CONSTRAINT (UI-SPEC §2, Legal): this Studio is a drafting
// assistant, NEVER a legal advisor. Unauthorized-practice-of-law liability is
// live litigation in 2026. Every prompt fragment, every system prompt, and
// the persistent UI banner all enforce: every output is a draft for attorney
// review; never assert a document is enforceable / binding / compliant / safe.

import type {
  Template,
  FirstUseInput,
  BrainSummary,
  BuildPromptArgs,
  OverrideRule,
} from "../templates/types";

export type { Template, FirstUseInput, BrainSummary, BuildPromptArgs, OverrideRule };

// Merge active tenant customizations into the prompt body. Legal reuses the
// marketing helper unchanged -- an override rule is role-agnostic.
export { overridesClause } from "../templates/types";

// Per-doc-type triage: how much lawyer involvement this document type needs
// before it's used. Surfaced as a chip on each workflow card so the user
// knows the stakes before they generate. This is the UI-SPEC's "needs a
// lawyer" classifier.
//
// Note the lowest tier is "routine", not "self-serve" -- no tier ever tells
// the user they can skip counsel. The hard contract holds for every document:
// it is a draft for attorney review. The tiers express *relative* risk, not
// permission to send something unreviewed.
export type TriageLevel = "attorney-required" | "attorney-recommended" | "routine";

export type TriageInfo = {
  level: TriageLevel;
  note: string;
};

// Conservative by design. When in doubt, escalate -- the cost of an
// unnecessary lawyer review is far below the cost of a bad unreviewed doc.
const LEGAL_DOC_TRIAGE: Record<string, TriageInfo> = {
  "legal:nda": {
    level: "routine",
    note: "Mutual NDAs are highly standardized. Review every blank carefully — it is still a draft, and an attorney review is never wrong.",
  },
  "legal:contractor-agreement": {
    level: "attorney-recommended",
    note: "IP ownership and classification clauses carry real risk — have an attorney check them.",
  },
  "legal:ip-assignment": {
    level: "attorney-recommended",
    note: "IP assignment is load-bearing for fundraising and M&A diligence. Get it reviewed.",
  },
  "legal:tos-privacy": {
    level: "attorney-required",
    note: "Privacy law is jurisdiction-specific and regulator-enforced (GDPR, CCPA). Do not self-serve.",
  },
  "legal:employment-terms": {
    level: "attorney-required",
    note: "Employment law varies by state and country and carries high liability. Attorney review is mandatory.",
  },
};

const DEFAULT_TRIAGE: TriageInfo = {
  level: "attorney-recommended",
  note: "Have an attorney review this draft before use.",
};

export function legalTriageFor(templateId: string): TriageInfo {
  return LEGAL_DOC_TRIAGE[templateId] ?? DEFAULT_TRIAGE;
}

// Prior decisions section. Legal documents lean on what the company has
// committed to (a fundraise structure, a hiring decision, a pricing model).
// Each line leads with the memory's uuid in [brackets] so the model can emit
// a valid <cite mem_id="..."/> tag -- without the id in context, the citation
// contract is dead (validateRun drops any id the model didn't actually see).
export function decisionsClause(decisions: BrainSummary["recent_decisions"]): string {
  if (!decisions || decisions.length === 0) return "Prior decisions: (none recorded).";
  const lines = decisions.slice(0, 5).map((d) => `- [${d.id}] ${d.title}: ${d.decision}`);
  return `Prior decisions (cite the bracketed mem_id when material):\n${lines.join("\n")}`;
}

export function teamClause(team: BrainSummary["team"]): string {
  if (!team || team.length === 0) return "Team: (none recorded).";
  const lines = team.slice(0, 8).map((m) => `- [${m.id}] ${m.name} (${m.role})`);
  return `Team members (cite the bracketed mem_id when one is a party to the document):\n${lines.join("\n")}`;
}

export function glossaryClause(glossary: BrainSummary["glossary"]): string {
  const terms = glossary?.terms ?? [];
  if (terms.length === 0) return "Glossary: (none recorded).";
  const lines = terms.slice(0, 8).map((t) => `- [${t.id}] ${t.term}: ${t.definition}`);
  return `Defined terms (use these spellings exactly; cite the bracketed mem_id when material):\n${lines.join("\n")}`;
}

export const LEGAL_CITATION_INSTRUCTION = `
Inline memory citations: whenever a sentence is materially shaped by a specific
memory in the brain (a prior decision, a team member, a defined term), append
a citation tag with the memory's id, e.g. "the founders agreed to a 4-year
vest<cite mem_id="..."/>". Use the exact uuid from the brain context. Never
invent ids. 1-4 citations per document is typical.
`.trim();

// The hard contract baked into every legal template + the run system prompt.
// This text overrides any other instruction the model might infer.
export const LEGAL_REVIEW_CONTRACT = `
LEGAL STUDIO HARD CONTRACT — this overrides any other instruction:
- You are a DRAFTING ASSISTANT, never a legal advisor. Every output is a draft
  for a human, and an attorney, to review. It is never final and never advice.
- NEVER assert a document is "enforceable", "binding", "valid", "compliant",
  "legally sound", or "safe to use". You cannot know that. Describe what the
  draft is intended to do — never what it guarantees.
- NEVER give legal advice or opine on the user's specific legal situation. If
  the user asks a legal question, draft the document and record the question
  in the "Before you use this" section for their attorney.
- Begin every document with this exact line, on its own:
  "DRAFT — not legal advice. For attorney review before use."
- End every document with a "## Before you use this" section that lists: every
  blank or bracketed value that needs a real value, every clause an attorney
  must check, and any jurisdiction-specific clause (law varies by state and
  country — you do not know the user's jurisdiction, so flag it, never assume).
- Use plain, conventional contract language. Do not invent novel clause
  structures — anchor to widely-used, standard forms (YC, Common Paper, and
  similar well-trodden templates).
`.trim();

// Every legal template emits one `doc` OutputBlock. The whole document goes
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
Markdown: # headings, **bold**, numbered clauses, and [BRACKETED] placeholders
for every value the user must fill in.
`.trim();
}
