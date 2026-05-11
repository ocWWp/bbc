import {
  CITATION_INSTRUCTION,
  overridesClause,
  voiceClause,
  type Template,
} from "./types";
import { registerTemplate } from "./registry";

const template: Template = {
  id: "cross-platform-campaign",
  label: "Cross-platform campaign",
  hint: "Same announcement, native to multiple platforms (X + LinkedIn + Threads). Picks this for launches, fundraises, big news.",
  kind: "x_post", // primary kind; the renderer detects multi-output and lays out a stack
  firstUseInputs: [
    {
      id: "platforms",
      label: "Platforms",
      hint: "Which platforms to draft for",
      required: true,
      kind: "select",
      options: ["X + LinkedIn", "X + LinkedIn + Threads", "X + Threads", "all four"],
      default: "X + LinkedIn + Threads",
    },
    {
      id: "core_message",
      label: "Core message",
      hint: "The one sentence every platform's version must land",
      required: true,
      kind: "text",
    },
  ],
  buildPrompt({ task, brain, inputs, overrides }) {
    return [
      "You are drafting a cross-platform marketing campaign for a startup founder.",
      "Each platform variant must feel NATIVE to that platform -- not the same text reformatted.",
      voiceClause(brain.voice),
      brain.product
        ? `Product: ${brain.product.positioning}. Target user: ${brain.product.target_user}. Differentiators: ${brain.product.differentiators.join("; ")}.`
        : "",
      `Task: ${task}`,
      `Platforms requested: ${inputs.platforms ?? "X + LinkedIn + Threads"}.`,
      `Core message every variant must land: ${inputs.core_message ?? "(unspecified)"}.`,
      overridesClause(overrides),
      "",
      "Constraints per platform:",
      "- X post: ≤280 chars, substance-first, no hook openers.",
      "- LinkedIn: 800-1500 chars, professional tone, no 'excited to announce'.",
      "- Threads: ≤500 chars, conversational, slightly more verbose than X.",
      "- Blog teaser: 2-3 short paragraphs, sets up the reader to click through.",
      "- Each variant must work standalone -- a reader who only sees one shouldn't feel they're missing context.",
      CITATION_INSTRUCTION,
      "",
      "Output as a single tool_use call with multiple OutputBlocks, one per platform:",
      "- { kind: 'x_post', props: { text } }",
      "- { kind: 'linkedin_post', props: { text } }",
      "- { kind: 'threads_post', props: { text } } (if requested)",
      "- { kind: 'blog_draft', props: { title, body } } (if requested)",
    ]
      .filter(Boolean)
      .join("\n");
  },
};

registerTemplate(template);
export default template;
