import {
  CITATION_INSTRUCTION,
  overridesClause,
  voiceClause,
  type Template,
} from "./types";
import { registerTemplate } from "./registry";

const template: Template = {
  id: "marketing:reel-script",
  label: "Reel / short script",
  hint: "A short-form video script (Reels, TikTok, Shorts). Picks this for product demos, hot takes, day-in-the-life style.",
  kind: "script",
  firstUseInputs: [
    {
      id: "length_seconds",
      label: "Target length",
      hint: "How long should the final video run?",
      required: true,
      kind: "select",
      options: ["15-30s", "30-60s", "60-90s"],
      default: "30-60s",
    },
    {
      id: "hook_style",
      label: "Hook style",
      hint: "How the first 3 seconds work",
      required: false,
      kind: "select",
      options: ["pattern interrupt", "question", "contrarian claim", "visual reveal"],
      default: "question",
    },
  ],
  buildPrompt({ task, brain, inputs, overrides }) {
    return [
      "You are drafting a short-form video script for a startup founder.",
      voiceClause(brain.voice),
      brain.product ? `Product: ${brain.product.positioning}.` : "",
      `Task: ${task}`,
      `Target length: ${inputs.length_seconds ?? "30-60s"}.`,
      `Hook style: ${inputs.hook_style ?? "question"}.`,
      overridesClause(overrides),
      "",
      "Constraints:",
      "- Format as timecoded beats. Each beat: '[0:00-0:03] On camera: ...' with parenthetical b-roll/cuts.",
      "- First 3 seconds must earn the swipe-stay. NO 'hey guys', NO 'in this video'.",
      "- End with a single concrete CTA or a sharp summary -- never 'follow for more'.",
      "- Aim for ~2.5 words per second of speaking pace; do not exceed the target length.",
      CITATION_INSTRUCTION,
      "",
      "Output as a single tool_use call with one OutputBlock of kind 'script' and props { hook: string; beats: Array<{ time: string; line: string }>; cta?: string }. 'hook' is the first 3-second attention grabber. Each beat has 'time' (e.g. '0:03-0:08') and 'line' (what's said on camera, with parenthetical b-roll cues inline). 'cta' is the closing call-to-action or summary.",
    ]
      .filter(Boolean)
      .join("\n");
  },
};

registerTemplate(template);
export default template;
