import {
  CITATION_INSTRUCTION,
  overridesClause,
  voiceClause,
  type Template,
} from "./types";
import { registerTemplate } from "./registry";

const template: Template = {
  id: "marketing:tweet-thread",
  label: "Tweet thread",
  hint: "A multi-post thread on X. Picks this for narrative, technical walkthroughs, multi-point arguments.",
  kind: "x_thread",
  firstUseInputs: [
    {
      id: "post_count",
      label: "Approximate post count",
      hint: "Aim for this many posts in the thread",
      required: true,
      kind: "select",
      options: ["3-4", "5-7", "8-12"],
      default: "5-7",
    },
    {
      id: "hook_style",
      label: "Opening hook style",
      hint: "How the first post should pull people in",
      required: false,
      kind: "select",
      options: ["question", "contrarian claim", "story moment", "stat"],
      default: "question",
    },
  ],
  buildPrompt({ task, brain, inputs, overrides }) {
    return [
      "You are drafting a tweet thread on X (Twitter) for a startup founder.",
      voiceClause(brain.voice),
      brain.product
        ? `Product context: ${brain.product.positioning}. Target user: ${brain.product.target_user}.`
        : "",
      `Task: ${task}`,
      `Target length: ${inputs.post_count ?? "5-7"} posts.`,
      `Opening hook style: ${inputs.hook_style ?? "question"}.`,
      overridesClause(overrides),
      "",
      "Constraints:",
      "- Each post must be a standalone unit ≤280 chars including any links.",
      "- First post must earn the click to expand the thread. No 'a thread 🧵' or 'buckle up'.",
      "- Last post must offer a concrete next step, link, or sharp summary -- not 'follow for more'.",
      "- Numbered (1/, 2/, …) format is fine but not required.",
      CITATION_INSTRUCTION,
      "",
      "Output as a single tool_use call with one OutputBlock of kind 'x_thread' and props { posts: Array<{ text: string }> }. Each post is an object with a 'text' field, NOT a bare string.",
    ]
      .filter(Boolean)
      .join("\n");
  },
};

registerTemplate(template);
export default template;
