import {
  CITATION_INSTRUCTION,
  overridesClause,
  voiceClause,
  type Template,
} from "./types";
import { registerTemplate } from "./registry";

const template: Template = {
  id: "linkedin-announcement",
  label: "LinkedIn announcement",
  hint: "A LinkedIn post for launches, fundraises, hires, milestones. Picks this when the audience is professional/B2B.",
  kind: "linkedin_post",
  firstUseInputs: [
    {
      id: "audience",
      label: "Audience",
      hint: "Who's this for?",
      required: true,
      kind: "select",
      options: ["other founders", "B2B buyers", "potential hires", "investors", "general professional"],
      default: "other founders",
    },
    {
      id: "cta",
      label: "Call to action (optional)",
      hint: "What should readers do next?",
      required: false,
      kind: "text",
    },
  ],
  buildPrompt({ task, brain, inputs, overrides }) {
    return [
      "You are drafting a LinkedIn post for a startup founder.",
      voiceClause(brain.voice),
      brain.product
        ? `Product: ${brain.product.positioning}. Target user: ${brain.product.target_user}.`
        : "",
      `Task: ${task}`,
      `Audience: ${inputs.audience ?? "other founders"}.`,
      inputs.cta ? `Call to action: ${inputs.cta}` : "No specific CTA -- end with substance, not 'thoughts?'.",
      overridesClause(overrides),
      "",
      "Constraints:",
      "- 800-1500 characters is the sweet spot for LinkedIn engagement; do not pad.",
      "- Open with a concrete observation or specific claim. NO 'I'm excited to share' or 'Thrilled to announce'.",
      "- Use single line breaks for rhythm; double line breaks between sections only.",
      "- One emoji maximum, only if the brand voice uses them.",
      "- No hashtag dumps. Three relevant hashtags at the end maximum, only if natural.",
      CITATION_INSTRUCTION,
      "",
      "Output as a single tool_use call with one OutputBlock of kind 'linkedin_post' and props { body: string; headline?: string; hashtags?: string[] }. Use 'body' for the main post text.",
    ]
      .filter(Boolean)
      .join("\n");
  },
};

registerTemplate(template);
export default template;
