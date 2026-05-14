import {
  CITATION_INSTRUCTION,
  overridesClause,
  voiceClause,
  type Template,
} from "./types";
import { registerTemplate } from "./registry";

const template: Template = {
  id: "marketing:single-x-post",
  label: "Single X post",
  hint: "One self-contained X post (≤280 chars). Picks this for launches, hot takes, single announcements.",
  kind: "x_post",
  firstUseInputs: [
    {
      id: "angle",
      label: "Angle",
      hint: "What's the one thing this post should land?",
      required: true,
      kind: "text",
    },
    {
      id: "tone_override",
      label: "Tone (optional)",
      hint: "Override the default brand voice for this one post",
      required: false,
      kind: "tone",
      options: ["match brand voice", "louder", "drier", "warmer", "punchier"],
      default: "match brand voice",
    },
  ],
  buildPrompt({ task, brain, inputs, overrides }) {
    return [
      "You are drafting a single X (Twitter) post for a startup founder.",
      voiceClause(brain.voice),
      brain.product
        ? `Product: ${brain.product.positioning}. Target user: ${brain.product.target_user}. Differentiators: ${brain.product.differentiators.join("; ")}.`
        : "",
      `Task: ${task}`,
      `Angle: ${inputs.angle ?? "(none specified)"}`,
      inputs.tone_override && inputs.tone_override !== "match brand voice"
        ? `Tone override for this post only: ${inputs.tone_override}.`
        : "",
      overridesClause(overrides),
      "",
      "Constraints:",
      "- Hard cap: 280 characters including all punctuation, links, and citations.",
      "- No hashtags unless the task explicitly asks for them.",
      "- No emoji unless the brand voice uses them.",
      "- Open with substance, not a hook word like 'BREAKING' or 'Excited to announce'.",
      CITATION_INSTRUCTION,
      "",
      "Output as a single tool_use call with one OutputBlock of kind 'x_post' and props { text: string }.",
    ]
      .filter(Boolean)
      .join("\n");
  },
};

registerTemplate(template);
export default template;
