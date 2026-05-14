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
  id: "design:component-spec",
  label: "Component spec",
  hint: "Spec a single reusable UI component. Picks this for 'spec the button component', 'define the toast', 'component spec for the date picker'.",
  kind: "plain",
  facets: ["engineering"],
  firstUseInputs: [
    {
      id: "component",
      label: "Component",
      hint: "The component you're specifying (e.g. 'Toast', 'SegmentedControl', 'CommentThread').",
      required: true,
      kind: "text",
    },
    {
      id: "purpose",
      label: "Purpose",
      hint: "What problem does this component solve? One or two sentences.",
      required: true,
      kind: "text",
    },
    {
      id: "usage",
      label: "Where it's used (optional)",
      hint: "Surfaces or flows that will consume it — helps bound the variants.",
      required: false,
      kind: "text",
    },
  ],
  buildPrompt({ task, brain, inputs, overrides }) {
    return [
      "You are drafting a reusable component specification for a startup's design + engineering team.",
      productClause(brain.product),
      voiceClause(brain.voice),
      decisionsClause(brain.recent_decisions),
      "",
      `Task: ${task}`,
      `Component: ${inputs.component ?? "(unspecified)"}`,
      `Purpose: ${inputs.purpose ?? "(unspecified)"}`,
      inputs.usage ? `Where it's used: ${inputs.usage}` : "",
      "",
      "Produce a component spec following this structure:",
      "  # <Component> — component spec",
      "  ",
      "  ## Purpose",
      "  What it's for and, just as important, what it is NOT for.",
      "  ",
      "  ## Anatomy",
      "  The parts of the component, named. What's required vs optional.",
      "  ",
      "  ## Props / API",
      "  A table-in-text: prop name, type, default, what it controls. Keep the surface minimal.",
      "  ",
      "  ## States",
      "  Default, hover/focus, active, disabled, loading, error — only the ones that apply.",
      "  ",
      "  ## Variants",
      "  Each variant: name, when to use it, how it differs. Resist inventing variants nobody asked for.",
      "  ",
      "  ## Content & copy",
      "  Any text the component renders, in brand voice. Character limits where they matter.",
      "  ",
      "  ## Accessibility",
      "  Roles, keyboard interaction, focus order, what a screen reader announces.",
      "",
      "Constraints:",
      "- Minimal API: every prop must earn its place. Flag props that smell like scope creep.",
      "- Match the team's voice for any rendered copy (per the voice memory).",
      "- Don't invent names that collide with shadcn/Material/iOS HIG vocabulary.",
      "- If a prior decision constrains the treatment or the token set, cite it.",
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
