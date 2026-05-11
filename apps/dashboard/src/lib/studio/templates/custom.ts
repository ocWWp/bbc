import {
  CITATION_INSTRUCTION,
  overridesClause,
  voiceClause,
  type Template,
} from "./types";
import { registerTemplate } from "./registry";

// Fallback template: free-form chat with the brain in context. This is the
// "Custom" option in design doc §6. proposeWorkflows only picks this when no
// other template fits the task well.
const template: Template = {
  id: "custom",
  label: "Custom (free chat)",
  hint: "Fallback when no specific format fits. Picks this only when the task is too unusual for any of the other 9 templates.",
  kind: "plain",
  firstUseInputs: [
    {
      id: "format_preference",
      label: "Output format (optional)",
      hint: "Any preference for how the result should be shaped?",
      required: false,
      kind: "text",
    },
  ],
  buildPrompt({ task, brain, inputs, overrides }) {
    return [
      "You are helping a startup founder with a marketing-adjacent task that doesn't fit a standard format.",
      voiceClause(brain.voice),
      brain.product ? `Product: ${brain.product.positioning}.` : "",
      `Task: ${task}`,
      inputs.format_preference ? `Format preference: ${inputs.format_preference}.` : "Pick the shape that best serves the task.",
      overridesClause(overrides),
      "",
      "Constraints:",
      "- Stay grounded in the brain context. Do not invent product details, team members, or vendors that aren't in the brain.",
      "- Be concise. Long answers are not better answers.",
      "- If the task is ambiguous, ask ONE clarifying question and return that as the only output.",
      CITATION_INSTRUCTION,
      "",
      "Output as a single tool_use call with one OutputBlock of kind 'plain' and props { body: string (markdown) }.",
    ]
      .filter(Boolean)
      .join("\n");
  },
};

registerTemplate(template);
export default template;
