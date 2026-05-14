import {
  productClause,
  decisionsClause,
  teamClause,
  FOUNDER_CITATION_INSTRUCTION,
  OUTPUT_AS_PLAIN_MARKDOWN,
  type Template,
} from "./types";
import { registerFounderTemplate } from "./registry";

const template: Template = {
  id: "founder:hiring-plan",
  label: "Hiring plan",
  hint: "A plan for who to hire next and why. Picks this for 'who should we hire', 'hiring plan for the next two quarters', 'headcount plan'.",
  kind: "plain",
  facets: ["hr"],
  firstUseInputs: [
    {
      id: "roles",
      label: "Roles in mind",
      hint: "Roles you're weighing, even loosely. One per line.",
      required: true,
      kind: "text",
    },
    {
      id: "timeframe",
      label: "Timeframe",
      hint: "Over what window? (e.g. 'next 2 quarters', 'by end of year')",
      required: true,
      kind: "text",
    },
    {
      id: "constraints",
      label: "Constraints (optional)",
      hint: "Budget, runway, a hard cap on headcount, must-haves.",
      required: false,
      kind: "text",
    },
  ],
  buildPrompt({ task, brain, inputs }) {
    return [
      "You are drafting a hiring plan for a startup founder.",
      productClause(brain.product),
      decisionsClause(brain.recent_decisions),
      teamClause(brain.team),
      "",
      `Task: ${task}`,
      `Roles in mind: ${inputs.roles ?? "(none)"}`,
      `Timeframe: ${inputs.timeframe ?? "(unspecified)"}`,
      inputs.constraints ? `Constraints: ${inputs.constraints}` : "",
      "",
      "Structure:",
      "  # Hiring plan — <timeframe>",
      "  ",
      "  **Summary:** 2-3 sentences. How many hires, in what order, against what constraint.",
      "  ",
      "  ## The current team",
      "  Briefly: where the team is strong and where it's stretched, grounded in the team memory.",
      "  ",
      "  ## Roles, in priority order",
      "  For each role: title, why it's needed now, what breaks if we don't hire it, rough seniority.",
      "  Order matters — the sequence is the recommendation.",
      "  ",
      "  ## Sequencing & tradeoffs",
      "  What gets deferred, and what the constraint (budget / runway / focus) forces.",
      "  ",
      "  ## Risks",
      "  What this plan bets on. What would change it.",
      "",
      "Constraints:",
      "- Ground every role in a real gap on the current team — no aspirational org-chart filling.",
      "- If runway or a prior decision bounds the plan, cite it and respect it.",
      "- Founder-tone: decisive. Recommend an order, don't list options and shrug.",
      FOUNDER_CITATION_INSTRUCTION,
      "",
      OUTPUT_AS_PLAIN_MARKDOWN,
    ]
      .filter(Boolean)
      .join("\n");
  },
};

registerFounderTemplate(template);
export default template;
