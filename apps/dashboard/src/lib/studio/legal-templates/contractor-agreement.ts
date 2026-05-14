import {
  decisionsClause,
  teamClause,
  glossaryClause,
  overridesClause,
  LEGAL_CITATION_INSTRUCTION,
  LEGAL_REVIEW_CONTRACT,
  outputAsDoc,
  type Template,
} from "./types";
import { registerLegalTemplate } from "./registry";

const template: Template = {
  id: "legal:contractor-agreement",
  label: "Contractor agreement",
  hint: "Draft an independent contractor / consulting agreement. Picks this for 'agreement for a freelance designer', 'consulting contract', 'hire a contractor'.",
  kind: "doc",
  firstUseInputs: [
    {
      id: "contractor",
      label: "Contractor & role",
      hint: "Who is the contractor and what will they do? (e.g. 'a freelance brand designer, ~6 weeks of work')",
      required: true,
      kind: "text",
    },
    {
      id: "terms",
      label: "Commercial terms",
      hint: "Rate or fixed fee, payment schedule, start/end or milestones. Whatever you've agreed.",
      required: true,
      kind: "text",
    },
    {
      id: "context",
      label: "Specifics",
      hint: "Anything pre-decided: IP ownership expectations, on-site vs remote, equipment, exclusivity, governing law.",
      required: false,
      kind: "text",
    },
  ],
  buildPrompt({ task, brain, inputs, overrides }) {
    return [
      "You are drafting an independent contractor agreement for a startup. Anchor to the standard consulting-agreement structure used by YC-style template sets.",
      LEGAL_REVIEW_CONTRACT,
      "",
      decisionsClause(brain.recent_decisions),
      teamClause(brain.team),
      glossaryClause(brain.glossary),
      "",
      `Task: ${task}`,
      `Contractor & role: ${inputs.contractor ?? "(unspecified)"}`,
      `Commercial terms: ${inputs.terms ?? "(unspecified)"}`,
      inputs.context ? `Specifics: ${inputs.context}` : "",
      "",
      "Produce a contractor agreement following this standard structure:",
      "  DRAFT — not legal advice. For attorney review before use.",
      "  ",
      "  # Independent Contractor Agreement",
      "  ",
      "  1. **Parties**",
      "  2. **Services** — scope of work; reference an attached SOW for specifics.",
      "  3. **Compensation & payment terms** — rate/fee, schedule, expenses.",
      "  4. **Term & termination** — duration, notice, termination for cause.",
      "  5. **Independent contractor status** — not an employee; the contractor is",
      "     responsible for their own taxes and benefits. Flag that misclassification",
      "     is a real risk an attorney must assess for the user's jurisdiction.",
      "  6. **Intellectual property** — work-product assignment to the company. This",
      "     clause is load-bearing; do not water it down.",
      "  7. **Confidentiality**",
      "  8. **Governing law** — [GOVERNING LAW / STATE] placeholder.",
      "  9. **Signatures**",
      "  ",
      "  ## Before you use this",
      "  Every bracketed value, the IP and classification clauses called out for",
      "  attorney review, and the jurisdiction decision flagged.",
      "",
      "Constraints:",
      "- The IP assignment and contractor-classification clauses are the high-risk",
      "  parts — write them carefully and flag both for attorney review.",
      "- Every name, rate, date is a [BRACKETED] placeholder.",
      "- Do not claim the agreement is enforceable or that the classification is correct.",
      LEGAL_CITATION_INSTRUCTION,
      overridesClause(overrides ?? []),
      "",
      outputAsDoc("Contractor Agreement"),
    ]
      .filter(Boolean)
      .join("\n");
  },
};

registerLegalTemplate(template);
export default template;
