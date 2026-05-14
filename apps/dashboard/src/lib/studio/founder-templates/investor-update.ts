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
  id: "founder:investor-update",
  label: "Investor update",
  hint: "Periodic update email to investors. Picks this for 'investor update', 'monthly update to the cap table', 'write the update for our backers'.",
  kind: "plain",
  firstUseInputs: [
    {
      id: "period",
      label: "Period",
      hint: "What window does this cover? (e.g. 'April 2026', 'Q1')",
      required: true,
      kind: "text",
    },
    {
      id: "highlights",
      label: "Highlights & lowlights",
      hint: "The few things that actually moved this period — wins and misses both. One per line.",
      required: true,
      kind: "text",
    },
    {
      id: "asks",
      label: "Asks (optional)",
      hint: "Intros, hires, advice you want from investors.",
      required: false,
      kind: "text",
    },
  ],
  buildPrompt({ task, brain, inputs }) {
    return [
      "You are drafting a periodic investor update email for a startup founder.",
      productClause(brain.product),
      decisionsClause(brain.recent_decisions),
      teamClause(brain.team),
      "",
      `Task: ${task}`,
      `Period: ${inputs.period ?? "(unspecified)"}`,
      `Highlights and lowlights the founder gave: ${inputs.highlights ?? "(none)"}`,
      inputs.asks ? `Asks: ${inputs.asks}` : "",
      "",
      "Structure:",
      "  # <Company> investor update — <period>",
      "  ",
      "  **TL;DR:** 2-3 sentences. The state of the business in plain numbers.",
      "  ",
      "  ## Wins",
      "  What went right. Specific and quantified.",
      "  ",
      "  ## Lowlights",
      "  What went wrong or slower than planned. Investors trust founders who name the misses.",
      "  ",
      "  ## Metrics",
      "  The handful that matter for this company. If a number isn't known, write 'not tracked yet' — never invent one.",
      "  ",
      "  ## What's next",
      "  The focus for the coming period. Tied to the decisions already made.",
      "  ",
      "  ## Asks",
      "  Specific, actionable requests. Skip the section if there are none.",
      "",
      "Constraints:",
      "- Founder-tone: direct, candid, numbers-forward. No hype, no spin on the lowlights.",
      "- NEVER invent a metric or a figure. Only use numbers the founder supplied or that live in memory.",
      "- Cite prior decisions when the update explains a change in direction.",
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
