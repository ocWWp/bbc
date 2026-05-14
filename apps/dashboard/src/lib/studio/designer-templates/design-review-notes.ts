import {
  voiceClause,
  productClause,
  decisionsClause,
  overridesClause,
  DESIGN_CITATION_INSTRUCTION,
  OUTPUT_AS_PLAIN_MARKDOWN,
  type Template,
} from "./types";
import { registerDesignerTemplate } from "./registry";

const template: Template = {
  id: "design:design-review-notes",
  label: "Design review notes",
  hint: "Synthesize a design-review discussion into clear notes. Picks this for 'write up the design review', 'notes from the crit', 'summarize the review thread'.",
  kind: "plain",
  facets: ["engineering"],
  firstUseInputs: [
    {
      id: "reviewed",
      label: "What was reviewed",
      hint: "The design, feature, or surface that got reviewed.",
      required: true,
      kind: "text",
    },
    {
      id: "discussion",
      label: "The discussion",
      hint: "Paste the raw notes, comments, or thread from the review. Messy is fine.",
      required: true,
      kind: "text",
    },
  ],
  buildPrompt({ task, brain, inputs, overrides }) {
    return [
      "You are synthesizing a design-review discussion into structured notes for a startup's design + engineering team.",
      productClause(brain.product),
      voiceClause(brain.voice),
      decisionsClause(brain.recent_decisions),
      "",
      `Task: ${task}`,
      `What was reviewed: ${inputs.reviewed ?? "(unspecified)"}`,
      `Raw discussion: ${inputs.discussion ?? "(none)"}`,
      "",
      "Produce review notes following this structure:",
      "  # Design review — <what was reviewed>",
      "  ",
      "  ## Outcome",
      "  One line: approved / approved-with-changes / needs-another-round.",
      "  ",
      "  ## Decisions",
      "  What got settled in the review. Each as a clear statement, not a paraphrase of the back-and-forth.",
      "  ",
      "  ## Changes requested",
      "  Numbered. Each: the change, the reasoning, and an owner placeholder.",
      "  ",
      "  ## Open threads",
      "  Anything left unresolved, with what's needed to close it.",
      "  ",
      "  ## Follow-ups",
      "  Concrete next actions with owner placeholders.",
      "",
      "Constraints:",
      "- Turn discussion into decisions — don't just transcribe who said what.",
      "- If the review touched something a prior decision already settled, cite it.",
      "- Keep it skimmable: a teammate who missed the review should get it in 60 seconds.",
      "- Attribute nothing to named individuals as criticism; describe the work, not the person.",
      overridesClause(overrides ?? []),
      DESIGN_CITATION_INSTRUCTION,
      "",
      OUTPUT_AS_PLAIN_MARKDOWN,
    ]
      .filter(Boolean)
      .join("\n");
  },
};

registerDesignerTemplate(template);
export default template;
