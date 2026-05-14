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
  id: "legal:ip-assignment",
  label: "IP assignment",
  hint: "Draft an intellectual-property assignment agreement. Picks this for 'assign the founder IP to the company', 'IP assignment for an advisor', 'transfer IP into the entity'.",
  kind: "doc",
  firstUseInputs: [
    {
      id: "assignor",
      label: "Who is assigning, to whom",
      hint: "The assignor and assignee. (e.g. 'a co-founder assigning to Acme Inc.', 'a contractor assigning work product to the company')",
      required: true,
      kind: "text",
    },
    {
      id: "scope",
      label: "What IP is covered",
      hint: "Code, designs, a brand, a patent, prior work created before incorporation? Be specific about what should transfer.",
      required: true,
      kind: "text",
    },
    {
      id: "context",
      label: "Specifics",
      hint: "Consideration (equity, employment, a fee?), any prior inventions to exclude, governing law.",
      required: false,
      kind: "text",
    },
  ],
  buildPrompt({ task, brain, inputs, overrides }) {
    return [
      "You are drafting an intellectual-property assignment agreement for a startup. This document is load-bearing for fundraising and M&A diligence — anchor to the standard, well-trodden assignment structure.",
      LEGAL_REVIEW_CONTRACT,
      "",
      decisionsClause(brain.recent_decisions),
      teamClause(brain.team),
      "",
      `Task: ${task}`,
      `Who is assigning, to whom: ${inputs.assignor ?? "(unspecified)"}`,
      `What IP is covered: ${inputs.scope ?? "(unspecified)"}`,
      inputs.context ? `Specifics: ${inputs.context}` : "",
      "",
      "Produce an IP assignment agreement following this standard structure:",
      "  DRAFT — not legal advice. For attorney review before use.",
      "  ",
      "  # Intellectual Property Assignment Agreement",
      "  ",
      "  1. **Parties** — assignor and assignee.",
      "  2. **Assigned IP** — define the property being assigned. Be precise; vague",
      "     scope is the most common diligence failure.",
      "  3. **Assignment** — present, irrevocable assignment of all right, title,",
      "     and interest.",
      "  4. **Prior inventions / exclusions** — a schedule for anything the assignor",
      "     created before and is NOT assigning. Leave [SCHEDULE A] as a placeholder.",
      "  5. **Further assurances** — assignor agrees to sign whatever's needed later",
      "     (patent filings, recordations).",
      "  6. **Consideration** — what the assignor receives. [BRACKETED] placeholder.",
      "  7. **Governing law** — [GOVERNING LAW / STATE] placeholder.",
      "  8. **Signatures**",
      "  ",
      "  ## Before you use this",
      "  Every bracketed value, the scope-of-assigned-IP clause flagged for careful",
      "  attorney review, the prior-inventions schedule, and the jurisdiction decision.",
      "",
      "Constraints:",
      "- Scope precision is everything here. An attorney must confirm the assigned-IP",
      "  definition actually captures what the company needs — flag it explicitly.",
      "- Every name, date, and consideration term is a [BRACKETED] placeholder.",
      "- Do not claim the assignment is effective, complete, or diligence-ready.",
      LEGAL_CITATION_INSTRUCTION,
      overridesClause(overrides ?? []),
      "",
      outputAsDoc("IP Assignment"),
    ]
      .filter(Boolean)
      .join("\n");
  },
};

registerLegalTemplate(template);
export default template;
