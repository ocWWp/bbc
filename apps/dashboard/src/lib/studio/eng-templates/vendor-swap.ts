import {
  decisionsClause,
  vendorsClause,
  ENG_CITATION_INSTRUCTION,
  OUTPUT_AS_PLAIN_MARKDOWN,
  type Template,
} from "./types";
import { registerEngTemplate } from "./registry";

const template: Template = {
  id: "eng:vendor-swap",
  label: "Vendor swap proposal",
  hint: "Propose replacing one vendor with another. Picks this for 'should we move from X to Y', 'evaluate alternatives to Z', vendor consolidation discussions.",
  kind: "plain",
  firstUseInputs: [
    {
      id: "current_vendor",
      label: "Current vendor",
      hint: "The vendor you'd be replacing (name + role, e.g. 'Mailgun, email-delivery').",
      required: true,
      kind: "text",
    },
    {
      id: "candidate_vendor",
      label: "Candidate vendor",
      hint: "The vendor you'd swap to (name + why it's on the shortlist).",
      required: true,
      kind: "text",
    },
    {
      id: "trigger",
      label: "Trigger",
      hint: "Why are we looking at this now? Cost, reliability, feature gap, compliance, founder gut feel?",
      required: false,
      kind: "text",
    },
  ],
  buildPrompt({ task, brain, inputs }) {
    return [
      "You are drafting a vendor swap proposal for a startup's engineering team.",
      decisionsClause(brain.recent_decisions),
      vendorsClause(brain.vendors),
      "",
      `Task: ${task}`,
      `Current vendor: ${inputs.current_vendor ?? "(unspecified)"}`,
      `Candidate vendor: ${inputs.candidate_vendor ?? "(unspecified)"}`,
      inputs.trigger ? `Trigger: ${inputs.trigger}` : "",
      "",
      "Produce a proposal with this structure:",
      "  # Vendor swap: <current> -> <candidate>",
      "  ",
      "  ## Trigger",
      "  Why this question is on the table now.",
      "  ",
      "  ## Comparison",
      "  | Dimension | Current | Candidate |",
      "  Compare on: cost model, reliability/uptime, feature coverage, integration cost,",
      "  switching cost, vendor lock-in risk, compliance posture.",
      "  ",
      "  ## Recommendation",
      "  One of: keep current / swap to candidate / parallel-run for N weeks then decide.",
      "  Give a concrete rationale -- not 'depends on team preference'.",
      "  ",
      "  ## Migration plan",
      "  If recommending the swap: 3-5 bullet steps with a rough effort estimate per step.",
      "  ",
      "  ## Open questions",
      "  What can't you answer without a spike or a sales call?",
      "",
      "Constraints:",
      "- Be honest about switching cost. Most swaps fail because the team underestimated migration effort.",
      "- If a prior decision locks the current vendor in, surface that and recommend keeping unless the new",
      "  evidence overwhelms it.",
      "- Cite team-level memory (vendors, prior decisions) where it shapes the recommendation.",
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
