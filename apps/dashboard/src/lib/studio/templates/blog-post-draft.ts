import {
  CITATION_INSTRUCTION,
  overridesClause,
  voiceClause,
  type Template,
} from "./types";
import { registerTemplate } from "./registry";

const template: Template = {
  id: "blog-post-draft",
  label: "Blog post draft",
  hint: "A long-form blog post draft. Picks this for product announcements with depth, technical posts, behind-the-scenes write-ups.",
  kind: "blog_draft",
  firstUseInputs: [
    {
      id: "target_words",
      label: "Target length",
      hint: "Approximate word count",
      required: true,
      kind: "select",
      options: ["400-600", "800-1200", "1500-2500"],
      default: "800-1200",
    },
    {
      id: "seo_keywords",
      label: "SEO keywords (optional)",
      hint: "Comma-separated phrases the post should rank for",
      required: false,
      kind: "text",
    },
  ],
  buildPrompt({ task, brain, inputs, overrides }) {
    return [
      "You are drafting a long-form blog post for a startup founder.",
      voiceClause(brain.voice),
      brain.product
        ? `Product context: ${brain.product.positioning}. Target user: ${brain.product.target_user}.`
        : "",
      brain.recent_decisions.length
        ? `Recent decisions to potentially cite: ${brain.recent_decisions.map((d) => `${d.title} (${d.id})`).join("; ")}.`
        : "",
      `Task: ${task}`,
      `Target word count: ${inputs.target_words ?? "800-1200"}.`,
      inputs.seo_keywords ? `SEO keywords to weave in naturally: ${inputs.seo_keywords}.` : "",
      overridesClause(overrides),
      "",
      "Constraints:",
      "- Open with a specific scene, observation, or claim. NO 'in today's fast-paced world' or 'we're living through a transformation'.",
      "- Use H2 subheadings (markdown ##) to break the post into 3-5 sections.",
      "- Concrete examples beat abstractions. If you reach for an example, anchor it in the founder's actual product/team/decisions.",
      "- End with a single sharp takeaway -- not a CTA, not 'what do you think?'",
      "- Markdown body; do not include HTML.",
      CITATION_INSTRUCTION,
      "",
      "Output as a single tool_use call with one OutputBlock of kind 'blog_draft' and props { title: string; subtitle?: string; body_markdown: string }. Use 'body_markdown' for the full markdown body.",
    ]
      .filter(Boolean)
      .join("\n");
  },
};

registerTemplate(template);
export default template;
