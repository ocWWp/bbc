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
  id: "eng:incident-retro",
  label: "Incident retro",
  hint: "Blameless postmortem after an outage or incident. Picks this for 'write up the outage', 'postmortem for the incident', 'RCA for last night'.",
  kind: "plain",
  firstUseInputs: [
    {
      id: "summary",
      label: "What happened",
      hint: "One or two sentences: what broke, who noticed, how long it lasted.",
      required: true,
      kind: "text",
    },
    {
      id: "timeline",
      label: "Timeline",
      hint: "Rough sequence of events — detection, escalation, mitigation, resolution. One per line is fine.",
      required: true,
      kind: "text",
    },
    {
      id: "impact",
      label: "Impact",
      hint: "Who or what was affected, and how badly? (optional)",
      required: false,
      kind: "text",
    },
  ],
  buildPrompt({ task, brain, inputs, overrides }) {
    return [
      "You are drafting a blameless incident retrospective (postmortem) for a software team.",
      decisionsClause(brain.recent_decisions),
      vendorsClause(brain.vendors),
      "",
      `Task: ${task}`,
      `What happened: ${inputs.summary ?? "(none)"}`,
      `Timeline the team gave: ${inputs.timeline ?? "(none)"}`,
      inputs.impact ? `Impact: ${inputs.impact}` : "",
      "",
      "Produce a complete incident retro following this structure exactly:",
      "  # Incident retro: <one-line summary>",
      "  ",
      "  **Severity:** <SEV1-4, your best estimate>",
      "  **Duration:** <detection → resolution>",
      "  **Status:** Draft",
      "  ",
      "  ## Summary",
      "  Two or three sentences a non-engineer could follow.",
      "  ",
      "  ## Timeline",
      "  Timestamped sequence: detection, escalation, mitigation, resolution.",
      "  ",
      "  ## Impact",
      "  Who and what was affected, quantified where possible.",
      "  ",
      "  ## Root cause",
      "  Five-whys style. The technical cause AND the systemic gap that let it ship.",
      "  ",
      "  ## What went well / what went poorly",
      "  Two short lists. Honest about both.",
      "  ",
      "  ## Action items",
      "  Numbered. Each with an owner placeholder and a rough priority. Concrete, not aspirational.",
      "",
      "Constraints:",
      "- Blameless: describe systems and decisions, never name individuals as the cause.",
      "- If a vendor or prior decision was a contributing factor, cite it plainly.",
      "- No 'we should be more careful' action items — every action must be a verifiable change.",
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
