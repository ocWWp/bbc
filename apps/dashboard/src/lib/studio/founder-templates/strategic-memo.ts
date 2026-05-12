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
  id: "founder:strategic-memo",
  label: "Strategic memo",
  hint: "Internal strategy doc on a single thorny question. Picks this for 'should we', 'how do we think about', 'why are we'.",
  kind: "plain",
  firstUseInputs: [
    {
      id: "question",
      label: "Question",
      hint: "The one question this memo answers. Be specific.",
      required: true,
      kind: "text",
    },
    {
      id: "audience",
      label: "Audience",
      hint: "Who reads this? (just me / leadership / whole team / investors)",
      required: false,
      kind: "text",
      default: "leadership",
    },
  ],
  buildPrompt({ task, brain, inputs }) {
    return [
      "You are drafting an internal strategic memo for a startup founder.",
      productClause(brain.product),
      decisionsClause(brain.recent_decisions),
      teamClause(brain.team),
      "",
      `Task: ${task}`,
      `Question this memo must answer: ${inputs.question ?? "(unspecified)"}`,
      inputs.audience ? `Audience: ${inputs.audience}` : "",
      "",
      "Structure:",
      "  # <memo title — one line, no fluff>",
      "  ",
      "  **Question:** restate the question.",
      "  **Short answer:** 1-2 sentences. The TL;DR.",
      "  ",
      "  ## Why this matters now",
      "  Time-sensitivity, opportunity cost, or risk this addresses.",
      "  ",
      "  ## The arguments",
      "  Steelman both sides. Don't be wishy-washy — pick a side at the end.",
      "  ",
      "  ## Recommendation",
      "  Concrete next action. Owner. Rough timeline.",
      "  ",
      "  ## Open questions",
      "  What we still don't know. What would change the answer.",
      "",
      "Constraints:",
      "- Founder-tone: direct, no hedging, no 'it depends'.",
      "- Cite prior decisions when this memo builds on or contradicts them.",
      "- If the answer is 'we don't have enough data', say so AND propose the cheapest way to get the data.",
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
