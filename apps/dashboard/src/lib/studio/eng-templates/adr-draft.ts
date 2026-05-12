import {
  decisionsClause,
  vendorsClause,
  ENG_CITATION_INSTRUCTION,
  OUTPUT_AS_PLAIN_MARKDOWN,
  type Template,
} from "./types";
import { registerEngTemplate } from "./registry";

const template: Template = {
  id: "eng:adr-draft",
  label: "Draft an ADR",
  hint: "Architecture Decision Record. Picks this for 'we need to decide between X and Y', 'document our choice of Z', or any decision worth recording.",
  kind: "plain",
  firstUseInputs: [
    {
      id: "context",
      label: "Context",
      hint: "What's the situation forcing a decision? (1-3 sentences)",
      required: true,
      kind: "text",
    },
    {
      id: "options",
      label: "Options under consideration",
      hint: "List the candidate approaches you're weighing (one per line, or comma-separated).",
      required: true,
      kind: "text",
    },
  ],
  buildPrompt({ task, brain, inputs }) {
    return [
      "You are drafting an Architecture Decision Record (ADR) for a software team.",
      decisionsClause(brain.recent_decisions),
      vendorsClause(brain.vendors),
      "",
      `Task: ${task}`,
      `Context the team gave: ${inputs.context ?? "(none)"}`,
      `Options under consideration: ${inputs.options ?? "(none)"}`,
      "",
      "Produce a complete ADR following this structure exactly:",
      "  # ADR-NNNN: <one-line decision title>",
      "  ",
      "  **Status:** Proposed",
      "  **Date:** <today>",
      "  **Deciders:** (leave blank for the team to fill in)",
      "  ",
      "  ## Context",
      "  Restate the problem clearly. Cite prior decisions if relevant.",
      "  ",
      "  ## Options Considered",
      "  For each option: name, one-line summary, pros, cons.",
      "  ",
      "  ## Decision",
      "  Pick one. Make the choice explicit and unambiguous.",
      "  ",
      "  ## Consequences",
      "  What gets easier, what gets harder, what we're locking ourselves into.",
      "",
      "Constraints:",
      "- Be specific. Avoid generic ADR cliches ('this gives us flexibility').",
      "- If two options are genuinely close, say so in the Decision section and pick a tiebreaker.",
      "- Reference prior decisions by title when this ADR builds on or contradicts one.",
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
