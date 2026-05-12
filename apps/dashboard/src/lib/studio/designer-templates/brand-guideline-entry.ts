import {
  voiceClause,
  productClause,
  DESIGN_CITATION_INSTRUCTION,
  OUTPUT_AS_PLAIN_MARKDOWN,
  type Template,
} from "./types";
import { registerDesignerTemplate } from "./registry";

const template: Template = {
  id: "design:brand-guideline-entry",
  label: "Brand guideline entry",
  hint: "Draft a new section of the brand guidelines. Picks this for 'document our color usage', 'write up our motion principles', 'codify how we handle X'.",
  kind: "plain",
  firstUseInputs: [
    {
      id: "topic",
      label: "Topic",
      hint: "What aspect of the brand are you codifying? (color, typography, motion, voice, photography, iconography, density, etc.)",
      required: true,
      kind: "text",
    },
    {
      id: "context",
      label: "Why now",
      hint: "What forced this? A disagreement? A new launch? Onboarding a contractor? One sentence.",
      required: false,
      kind: "text",
    },
  ],
  buildPrompt({ task, brain, inputs }) {
    return [
      "You are drafting a brand guideline entry for a startup. The audience is contributors who need to make consistent decisions without having to ask.",
      productClause(brain.product),
      voiceClause(brain.voice),
      "",
      `Task: ${task}`,
      `Topic: ${inputs.topic ?? "(unspecified)"}`,
      inputs.context ? `Why now: ${inputs.context}` : "",
      "",
      "Produce a guideline entry following this structure:",
      "  # <topic>",
      "  ",
      "  ## What we believe",
      "  One paragraph. The underlying principle, not the rule. The principle is the load-bearing part;",
      "  the rules below derive from it.",
      "  ",
      "  ## How we do it",
      "  Numbered list of concrete rules. Each rule:",
      "    - has one obvious correct answer (no 'consider' / 'try to')",
      "    - is verifiable (a reviewer can tell yes/no)",
      "    - tells the reader what to do, not what to think about",
      "  Examples and counter-examples in code blocks when relevant.",
      "  ",
      "  ## Anti-patterns",
      "  3-5 patterns that look right but aren't. Why they're tempting; why they break.",
      "  ",
      "  ## Exceptions",
      "  Real exceptions, named. If there are none, say so explicitly -- don't add 'exceptions may apply'.",
      "  ",
      "  ## Open questions",
      "  Anything we don't have an answer for yet. Tag with @owner if known.",
      "",
      "Constraints:",
      "- Brand guidelines are for decisions, not for inspiration. Be opinionated.",
      "- Voice match: read like the team writes (per the voice memory). No design-school jargon.",
      "- If this entry contradicts existing guidance, surface that explicitly in 'Exceptions'.",
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
