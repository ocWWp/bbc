import {
  decisionsClause,
  teamClause,
  overridesClause,
  LEGAL_CITATION_INSTRUCTION,
  LEGAL_REVIEW_CONTRACT,
  outputAsDoc,
  type Template,
} from "./types";
import { registerLegalTemplate } from "./registry";

const template: Template = {
  id: "legal:employment-terms",
  label: "Employment terms",
  hint: "Draft an employment agreement or offer-terms document. Picks this for 'employment agreement for the first engineer', 'offer terms', 'employment contract'.",
  kind: "doc",
  firstUseInputs: [
    {
      id: "role",
      label: "Role & employee",
      hint: "The position and who it's for. (e.g. 'founding engineer', 'Head of Sales for [name]')",
      required: true,
      kind: "text",
    },
    {
      id: "terms",
      label: "Compensation & terms",
      hint: "Salary, equity, start date, employment type (full-time), reporting line. Whatever's agreed.",
      required: true,
      kind: "text",
    },
    {
      id: "context",
      label: "Location & specifics",
      hint: "Where will the employee work (which state / country)? At-will vs contract, benefits, anything pre-decided. Location drives which employment law applies.",
      required: false,
      kind: "text",
    },
  ],
  buildPrompt({ task, brain, inputs, overrides }) {
    return [
      "You are drafting an employment agreement for a startup. Employment law varies sharply by state and country and carries high liability — anchor to standard structures and flag every jurisdiction-dependent clause for mandatory attorney review.",
      LEGAL_REVIEW_CONTRACT,
      "",
      decisionsClause(brain.recent_decisions),
      teamClause(brain.team),
      "",
      `Task: ${task}`,
      `Role & employee: ${inputs.role ?? "(unspecified)"}`,
      `Compensation & terms: ${inputs.terms ?? "(unspecified)"}`,
      inputs.context ? `Location & specifics: ${inputs.context}` : "",
      "",
      "Produce an employment agreement following this standard structure:",
      "  DRAFT — not legal advice. For attorney review before use.",
      "  ",
      "  # Employment Agreement",
      "  ",
      "  1. **Parties & position** — employer, employee, title, reporting line.",
      "  2. **Start date & employment type** — full-time; at-will status is",
      "     [JURISDICTION-DEPENDENT] — flag it, do not assume at-will applies.",
      "  3. **Compensation** — salary, pay schedule. [BRACKETED] values.",
      "  4. **Equity** — reference the option grant / equity terms; the actual grant",
      "     is a separate document — note that.",
      "  5. **Benefits** — reference the company's benefits, [BRACKETED] where unknown.",
      "  6. **Confidentiality & IP assignment** — reference or incorporate the",
      "     company's standard CIIAA; flag for attorney review.",
      "  7. **Termination** — notice, and what survives. [JURISDICTION-DEPENDENT].",
      "  8. **Governing law** — [GOVERNING LAW / STATE] placeholder.",
      "  9. **Signatures**",
      "  ",
      "  ## Before you use this",
      "  Every bracketed value, EVERY [JURISDICTION-DEPENDENT] clause, a clear note",
      "  that employment law is state/country-specific and attorney review is",
      "  mandatory, and the separate documents still needed (equity grant, CIIAA).",
      "",
      "Constraints:",
      "- Do not assume at-will employment, non-compete enforceability, or any",
      "  termination rule — all are jurisdiction-dependent. Flag, never assume.",
      "- Every name, salary, date, equity figure is a [BRACKETED] placeholder.",
      "- Do not claim the agreement is enforceable or compliant with employment law.",
      LEGAL_CITATION_INSTRUCTION,
      overridesClause(overrides ?? []),
      "",
      outputAsDoc("Employment Terms"),
    ]
      .filter(Boolean)
      .join("\n");
  },
};

registerLegalTemplate(template);
export default template;
