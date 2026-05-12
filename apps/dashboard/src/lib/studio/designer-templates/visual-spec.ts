import {
  voiceClause,
  productClause,
  decisionsClause,
  DESIGN_CITATION_INSTRUCTION,
  OUTPUT_AS_PLAIN_MARKDOWN,
  type Template,
} from "./types";
import { registerDesignerTemplate } from "./registry";

const template: Template = {
  id: "design:visual-spec",
  label: "Visual spec",
  hint: "Spec a UI for a feature or screen. Picks this for 'design the X page', 'spec the onboarding flow', 'visual brief for Y'.",
  kind: "plain",
  firstUseInputs: [
    {
      id: "feature",
      label: "Feature or surface",
      hint: "What are you specifying? (e.g. 'the empty state on /memory', 'a billing settings page', 'the new comment thread component')",
      required: true,
      kind: "text",
    },
    {
      id: "goal",
      label: "User goal",
      hint: "What does the user want to do here? One sentence.",
      required: true,
      kind: "text",
    },
    {
      id: "constraints",
      label: "Constraints (optional)",
      hint: "Anything pre-determined? Mobile-first, brand colors only, no animation, has-to-match-existing-pattern X?",
      required: false,
      kind: "text",
    },
  ],
  buildPrompt({ task, brain, inputs }) {
    return [
      "You are drafting a visual specification for a startup's product designer + engineer.",
      productClause(brain.product),
      voiceClause(brain.voice),
      decisionsClause(brain.recent_decisions),
      "",
      `Task: ${task}`,
      `Feature / surface: ${inputs.feature ?? "(unspecified)"}`,
      `User goal: ${inputs.goal ?? "(unspecified)"}`,
      inputs.constraints ? `Constraints: ${inputs.constraints}` : "",
      "",
      "Produce a visual spec following this structure:",
      "  # <feature name> — visual spec",
      "  ",
      "  ## Goal",
      "  One paragraph. What does the user accomplish? What's the success state?",
      "  ",
      "  ## Layout",
      "  Top-to-bottom (mobile) or left-to-right (desktop) breakdown of the regions on the surface.",
      "  Call out the dominant element on first paint. Be concrete about hierarchy.",
      "  ",
      "  ## Components",
      "  Numbered list. For each meaningful component:",
      "    - **Component**: <name>",
      "    - **Purpose**: what role it plays here",
      "    - **States**: default, hover/focus, loading, empty, error, success (only list relevant ones)",
      "    - **Copy**: exact strings, in brand voice",
      "  ",
      "  ## Motion",
      "  Only when motion improves comprehension. List each animation with: trigger, duration, easing, purpose.",
      "  If no motion is needed, say so plainly. Don't pad with decoration.",
      "  ",
      "  ## Edge cases",
      "  Empty data, slow network, permission denied, error states, very long content. One bullet each.",
      "  ",
      "  ## Open questions",
      "  What couldn't you specify without more context? Be honest -- this becomes the design-review agenda.",
      "",
      "Constraints:",
      "- Be specific. 'A clean modern button' is a placeholder, not a spec.",
      "- All copy must match the team's voice (per the voice memory).",
      "- If a prior decision constrains the visual treatment, cite it.",
      "- Don't invent component names that conflict with shadcn/Material/iOS HIG vocabulary.",
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
