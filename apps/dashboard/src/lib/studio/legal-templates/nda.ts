import {
  decisionsClause,
  glossaryClause,
  overridesClause,
  LEGAL_CITATION_INSTRUCTION,
  LEGAL_REVIEW_CONTRACT,
  outputAsDoc,
  type Template,
} from "./types";
import { registerLegalTemplate } from "./registry";

const template: Template = {
  id: "legal:nda",
  label: "NDA",
  hint: "Draft a mutual or one-way non-disclosure agreement. Picks this for 'NDA for a contractor', 'mutual NDA before the partnership talk', 'confidentiality agreement'.",
  kind: "doc",
  firstUseInputs: [
    {
      id: "parties",
      label: "Parties",
      hint: "Who is signing? (e.g. 'Acme Inc. and a prospective design contractor', 'us and BigCo for partnership talks')",
      required: true,
      kind: "text",
    },
    {
      id: "direction",
      label: "One-way or mutual",
      hint: "Mutual (both share confidential info) or one-way (only one side discloses)? If unsure, say what each side will share.",
      required: true,
      kind: "text",
    },
    {
      id: "context",
      label: "Purpose & specifics",
      hint: "What's the confidential exchange for? Any term length, governing-law preference, or carve-outs you already know you want.",
      required: false,
      kind: "text",
    },
  ],
  buildPrompt({ task, brain, inputs, overrides }) {
    return [
      "You are drafting a non-disclosure agreement for a startup. Anchor to the standard, widely-used mutual NDA structure — do not invent novel clauses.",
      LEGAL_REVIEW_CONTRACT,
      "",
      decisionsClause(brain.recent_decisions),
      glossaryClause(brain.glossary),
      "",
      `Task: ${task}`,
      `Parties: ${inputs.parties ?? "(unspecified)"}`,
      `One-way or mutual: ${inputs.direction ?? "(unspecified)"}`,
      inputs.context ? `Purpose & specifics: ${inputs.context}` : "",
      "",
      "Produce an NDA following this standard structure:",
      "  DRAFT — not legal advice. For attorney review before use.",
      "  ",
      "  # Non-Disclosure Agreement",
      "  ",
      "  1. **Parties** — name each party; use [BRACKETED] placeholders for legal",
      "     entity names and addresses.",
      "  2. **Definition of Confidential Information** — what's covered.",
      "  3. **Exclusions** — the standard carve-outs (already public, independently",
      "     developed, rightfully received, required by law).",
      "  4. **Obligations** — use, protect, don't disclose.",
      "  5. **Term** — duration of the agreement and survival of obligations.",
      "  6. **Return or destruction** of materials.",
      "  7. **No license / no obligation** — disclosure grants no IP rights, no deal.",
      "  8. **Governing law** — leave as [GOVERNING LAW / STATE] for the user to set.",
      "  9. **Signatures** — signature blocks for each party.",
      "  ",
      "  ## Before you use this",
      "  Every bracketed value to fill, every clause an attorney should check, and the",
      "  governing-law / jurisdiction decision flagged explicitly.",
      "",
      "Constraints:",
      "- Standard clauses only. An NDA that reads as unusual gets rejected by the other side's counsel.",
      "- Every party name, date, address, and term length is a [BRACKETED] placeholder.",
      "- Do not claim the NDA is enforceable or sufficient — describe what it does.",
      LEGAL_CITATION_INSTRUCTION,
      overridesClause(overrides ?? []),
      "",
      outputAsDoc("NDA"),
    ]
      .filter(Boolean)
      .join("\n");
  },
};

registerLegalTemplate(template);
export default template;
