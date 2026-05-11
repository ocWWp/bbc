import {
  CITATION_INSTRUCTION,
  overridesClause,
  voiceClause,
  type Template,
} from "./types";
import { registerTemplate } from "./registry";

const template: Template = {
  id: "threads-post",
  label: "Threads post",
  hint: "A Meta Threads post. Picks this when audience skews creator/lifestyle or the founder explicitly mentions Threads.",
  kind: "threads_post",
  firstUseInputs: [
    {
      id: "angle",
      label: "Angle",
      hint: "What's the one thing to land?",
      required: true,
      kind: "text",
    },
  ],
  buildPrompt({ task, brain, inputs, overrides }) {
    return [
      "You are drafting a Threads (Meta) post for a startup founder.",
      voiceClause(brain.voice),
      brain.product ? `Product: ${brain.product.positioning}.` : "",
      `Task: ${task}`,
      `Angle: ${inputs.angle ?? "(none specified)"}`,
      overridesClause(overrides),
      "",
      "Constraints:",
      "- Cap: 500 characters.",
      "- Threads skews conversational and slightly more verbose than X. Use that.",
      "- One emoji max, only if the brand voice uses them.",
      "- No hashtags unless the task asks for them.",
      CITATION_INSTRUCTION,
      "",
      "Output as a single tool_use call with one OutputBlock of kind 'threads_post' and props { text: string }.",
    ]
      .filter(Boolean)
      .join("\n");
  },
};

registerTemplate(template);
export default template;
