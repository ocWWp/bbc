import {
  decisionsClause,
  vendorsClause,
  overridesClause,
  ENG_CITATION_INSTRUCTION,
  OUTPUT_AS_PLAIN_MARKDOWN,
  type Template,
} from "./types";
import { registerEngTemplate } from "./registry";

const template: Template = {
  id: "eng:rfc-draft",
  label: "Draft an RFC",
  hint: "A design doc / RFC proposing a change before it's built. Picks this for 'write an RFC for', 'design doc for', 'propose how we should build X'.",
  kind: "plain",
  facets: ["designer"],
  firstUseInputs: [
    {
      id: "problem",
      label: "Problem",
      hint: "What needs solving, and why now? (1-3 sentences)",
      required: true,
      kind: "text",
    },
    {
      id: "approach",
      label: "Proposed approach",
      hint: "The approach you're proposing — enough that a reviewer can react to it.",
      required: true,
      kind: "text",
    },
    {
      id: "alternatives",
      label: "Alternatives (optional)",
      hint: "Other approaches you considered or rejected.",
      required: false,
      kind: "text",
    },
  ],
  buildPrompt({ task, brain, inputs, overrides }) {
    return [
      "You are drafting an RFC (request for comments / design doc) for a software team.",
      decisionsClause(brain.recent_decisions),
      vendorsClause(brain.vendors),
      "",
      `Task: ${task}`,
      `Problem: ${inputs.problem ?? "(none)"}`,
      `Proposed approach: ${inputs.approach ?? "(none)"}`,
      inputs.alternatives ? `Alternatives the team mentioned: ${inputs.alternatives}` : "",
      "",
      "Produce a complete RFC following this structure exactly:",
      "  # RFC: <one-line title>",
      "  ",
      "  **Status:** Draft",
      "  **Author:** (leave blank)",
      "  **Reviewers:** (leave blank)",
      "  ",
      "  ## Problem",
      "  What we're solving and why it matters now. Cite prior decisions if this builds on them.",
      "  ",
      "  ## Goals / Non-goals",
      "  Two short lists. Non-goals are as important as goals — they bound the review.",
      "  ",
      "  ## Proposal",
      "  The approach in enough detail to react to. Diagrams-in-words are fine.",
      "  ",
      "  ## Alternatives considered",
      "  For each: one-line summary, why it was not chosen.",
      "  ",
      "  ## Risks & open questions",
      "  What could go wrong, what we still don't know. This is the review agenda.",
      "  ",
      "  ## Rollout",
      "  How this ships safely — flags, migration, backout plan.",
      "",
      "Constraints:",
      "- Be specific. An RFC a reviewer can't disagree with is too vague to be useful.",
      "- If this contradicts a prior decision, say so explicitly and justify it.",
      "- Keep non-goals honest — don't quietly smuggle scope into the proposal.",
      overridesClause(overrides ?? []),
      ENG_CITATION_INSTRUCTION,
      "",
      OUTPUT_AS_PLAIN_MARKDOWN,
    ]
      .filter(Boolean)
      .join("\n");
  },
};

registerEngTemplate(template);
export default template;
