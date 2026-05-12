import {
  voiceClause,
  productClause,
  DESIGN_CITATION_INSTRUCTION,
  OUTPUT_AS_PLAIN_MARKDOWN,
  type Template,
} from "./types";
import { registerDesignerTemplate } from "./registry";

const template: Template = {
  id: "design:ui-copy-pass",
  label: "UI copy pass",
  hint: "Rewrite UI copy in brand voice. Picks this for 'audit the strings on X', 'tighten up the empty-state copy', 'these labels feel off'.",
  kind: "plain",
  firstUseInputs: [
    {
      id: "strings",
      label: "Strings to audit",
      hint: "Paste the current UI copy. One string per line, or labelled (e.g. 'header: ...').",
      required: true,
      kind: "text",
    },
    {
      id: "surface",
      label: "Surface",
      hint: "Where are these strings? (e.g. 'empty state of /memory', 'sign-in error toasts', 'pricing page CTAs')",
      required: false,
      kind: "text",
    },
  ],
  buildPrompt({ task, brain, inputs }) {
    return [
      "You are auditing and rewriting UI strings for a startup's product surface. The output is a per-string diff: what was there, what to ship.",
      productClause(brain.product),
      voiceClause(brain.voice),
      "",
      `Task: ${task}`,
      `Surface: ${inputs.surface ?? "(unspecified)"}`,
      "",
      "Strings the team provided:",
      inputs.strings ?? "(none)",
      "",
      "Produce a copy-pass document with this structure:",
      "  # UI copy pass — <surface>",
      "  ",
      "  ## Summary",
      "  One paragraph: what pattern of problems did you find? (Too many CTAs? Hedging? Inconsistent capitalization? Generic words?)",
      "  ",
      "  ## Rewrites",
      "  For every string. Table form:",
      "  | Before | After | Why |",
      "  | --- | --- | --- |",
      "  Use the brand voice's do/don't words and example phrases. Keep length similar to original unless the original is bloated -- then trim.",
      "  ",
      "  ## Don't ship",
      "  3-5 patterns to avoid for any *future* copy on this surface. Each pattern: short name + example.",
      "",
      "Constraints:",
      "- Every rewrite must be unambiguously better. If you can't make a string better, leave it alone and say so in the 'Why' column.",
      "- Match brand voice precisely. If the voice memory says 'lowercase, direct' and the original is title-case marketing-speak, fix it.",
      "- Don't introduce new words that aren't in the team's vocabulary. Stick with the do_words list when possible.",
      "- Preserve any interpolations / placeholders / variable names exactly (e.g. <code>{count}</code>, <code>%s</code>).",
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
