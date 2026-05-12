import {
  CITATION_INSTRUCTION,
  overridesClause,
  voiceClause,
  type Template,
} from "./types";
import { registerTemplate } from "./registry";

const template: Template = {
  id: "hashtag-strategy",
  label: "Hashtag strategy",
  hint: "Recommends hashtags for a given platform mix and topic. Picks this when the task explicitly mentions hashtags or discoverability.",
  kind: "plain",
  firstUseInputs: [
    {
      id: "platform_mix",
      label: "Platforms",
      hint: "Which platforms is this for?",
      required: true,
      kind: "select",
      options: ["X", "LinkedIn", "Instagram + Threads", "TikTok", "all"],
      default: "X",
    },
    {
      id: "topic_focus",
      label: "Topic focus",
      hint: "What's the post about?",
      required: true,
      kind: "text",
    },
  ],
  buildPrompt({ task, brain, inputs, overrides }) {
    return [
      "You are recommending a hashtag strategy for a startup founder. Output is a small, curated list -- NOT a 20-tag dump.",
      voiceClause(brain.voice),
      brain.product ? `Product: ${brain.product.positioning}. Target user: ${brain.product.target_user}.` : "",
      `Task: ${task}`,
      `Platforms: ${inputs.platform_mix ?? "X"}.`,
      `Topic focus: ${inputs.topic_focus ?? "(unspecified)"}.`,
      overridesClause(overrides),
      "",
      "Constraints:",
      "- Recommend 3-7 hashtags per platform, no more.",
      "- For each tag: include the tag, a 1-sentence rationale, and a rough relevance tier (broad / niche / community).",
      "- Avoid generic hashtags like #marketing #startup unless they actually fit the topic precisely.",
      "- If platform doesn't use hashtags effectively (LinkedIn over-uses them), say so and recommend 0-2.",
      CITATION_INSTRUCTION,
      "",
      "Output as a single tool_use call with one OutputBlock of kind 'plain' and props { text: string }. Format the 'text' as markdown with a section per platform: '## <Platform>' headings, then a bullet per hashtag in the form '- **#tag** (tier) — one-sentence rationale'.",
    ]
      .filter(Boolean)
      .join("\n");
  },
};

registerTemplate(template);
export default template;
