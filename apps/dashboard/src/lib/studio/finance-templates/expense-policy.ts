import {
  decisionsClause,
  vendorsClause,
  overridesClause,
  FINANCE_CITATION_INSTRUCTION,
  outputAsDoc,
  type Template,
} from "./types";
import { registerFinanceTemplate } from "./registry";

const template: Template = {
  id: "finance:expense-policy",
  label: "Expense policy",
  hint: "Draft or revise an expense / spend policy. Picks this for 'write our travel policy', 'what's our policy on software purchases', 'codify the reimbursement rules'.",
  kind: "doc",
  firstUseInputs: [
    {
      id: "area",
      label: "Policy area",
      hint: "What spend does this policy cover? (e.g. 'travel & meals', 'software & subscriptions', 'home-office equipment')",
      required: true,
      kind: "text",
    },
    {
      id: "context",
      label: "Constraints & intent",
      hint: "Any limits, dollar thresholds, or principles already decided. What problem is this policy solving — overspend, slow approvals, unfairness?",
      required: false,
      kind: "text",
    },
  ],
  buildPrompt({ task, brain, inputs, overrides }) {
    return [
      "You are drafting an expense policy for a small startup. The audience is every employee: the policy has to be unambiguous enough that nobody needs to ask, and short enough that they actually read it.",
      decisionsClause(brain.recent_decisions),
      vendorsClause(brain.vendors),
      "",
      `Task: ${task}`,
      `Policy area: ${inputs.area ?? "(unspecified)"}`,
      inputs.context ? `Constraints & intent: ${inputs.context}` : "",
      "",
      "Produce an expense policy with this structure:",
      "  # <area> policy",
      "  ",
      "  ## Principle",
      "  One paragraph. The spirit of the policy — the judgment call to make when a",
      "  specific rule doesn't cover a situation. The rules below derive from this.",
      "  ",
      "  ## What's covered",
      "  Numbered list. Each item: what the company pays for, and any dollar limit.",
      "  Concrete. 'Reasonable' is not a number — give the number.",
      "  ",
      "  ## Limits & approvals",
      "  A table: spend tier, who approves, how. Make the fast path obviously fast.",
      "  ",
      "  ## What's not covered",
      "  Explicit list of what the company does not reimburse. Ambiguity here is what",
      "  causes the awkward conversation later — remove it.",
      "  ",
      "  ## Edge cases",
      "  3-5 real situations the rules above don't obviously answer, each with the answer.",
      "",
      "Constraints:",
      "- Every limit is a specific number, not an adjective.",
      "- The approval path must be genuinely fast for small amounts, or people route around it.",
      "- If a dollar threshold wasn't given and isn't in memory, pick a sensible startup-",
      "  scale default and mark it **(suggested — confirm)** so the user knows to set it.",
      FINANCE_CITATION_INSTRUCTION,
      overridesClause(overrides ?? []),
      "",
      outputAsDoc("Expense Policy"),
    ]
      .filter(Boolean)
      .join("\n");
  },
};

registerFinanceTemplate(template);
export default template;
