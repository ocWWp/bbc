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
  id: "founder:board-update",
  label: "Board update",
  hint: "Monthly or quarterly update to investors and advisors. Picks this for 'investor update', 'board email', 'monthly recap for investors'.",
  kind: "plain",
  firstUseInputs: [
    {
      id: "period",
      label: "Period covered",
      hint: "e.g. 'November 2026', 'Q4 2026', 'since last update on X'.",
      required: true,
      kind: "text",
    },
    {
      id: "key_metric",
      label: "Headline metric",
      hint: "The number that summarizes the period (revenue, signups, retention — whatever you optimize against).",
      required: false,
      kind: "text",
    },
    {
      id: "ask",
      label: "Specific ask",
      hint: "What do you need from this audience? Intros, advice on X, a check-in call?",
      required: false,
      kind: "text",
    },
  ],
  buildPrompt({ task, brain, inputs }) {
    return [
      "You are drafting a board / investor update from a startup founder.",
      productClause(brain.product),
      decisionsClause(brain.recent_decisions),
      teamClause(brain.team),
      "",
      `Task: ${task}`,
      `Period: ${inputs.period ?? "(unspecified)"}`,
      inputs.key_metric ? `Headline metric: ${inputs.key_metric}` : "",
      inputs.ask ? `Ask: ${inputs.ask}` : "",
      "",
      "Structure:",
      "  Subject: <Company> board update — <period>",
      "  ",
      "  ## TL;DR",
      "  Three bullets max.",
      "  ",
      "  ## The numbers",
      "  Headline metric + 2-3 supporting metrics, with deltas vs prior period.",
      "  ",
      "  ## What we shipped",
      "  Bullet list of meaningful shipped work this period. Tie back to a prior decision when relevant.",
      "  ",
      "  ## What's hard",
      "  Be specific about the top 1-2 problems. Founders who hide problems lose credibility.",
      "  ",
      "  ## Ask",
      "  Specific. Name names if helpful (intros to X, feedback on Y).",
      "",
      "Constraints:",
      "- Be specific about numbers. 'Up significantly' isn't a number; '$42k -> $58k' is.",
      "- If the period was bad, lead with the bad news plus what you're doing about it.",
      "- Tone: matter-of-fact, not promotional.",
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
