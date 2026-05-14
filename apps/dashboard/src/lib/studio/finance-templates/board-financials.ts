import {
  decisionsClause,
  vendorsClause,
  metricsClause,
  overridesClause,
  FINANCE_CITATION_INSTRUCTION,
  FINANCE_NARRATIVE_CONTRACT,
  outputAsDoc,
  type Template,
} from "./types";
import { registerFinanceTemplate } from "./registry";

const template: Template = {
  id: "finance:board-financials",
  label: "Board financials",
  hint: "The financial section of a board deck/update. Picks this for 'write up Q3 financials for the board', 'board numbers narrative', 'financial review for the deck'.",
  kind: "doc",
  firstUseInputs: [
    {
      id: "period",
      label: "Period",
      hint: "Which period do these numbers cover? (e.g. 'Q3 2026', 'September 2026', 'H1 2026')",
      required: true,
      kind: "text",
    },
    {
      id: "numbers",
      label: "The numbers",
      hint: "Paste the actuals: revenue, gross margin, burn, cash, headcount — whatever you have. One per line. The Studio will not invent any figure you don't give it.",
      required: true,
      kind: "text",
    },
    {
      id: "context",
      label: "What moved and why",
      hint: "Anything you already know about why a number changed — a deal closed late, a one-time bill, a new hire started. Optional, but it's what makes the narrative real.",
      required: false,
      kind: "text",
    },
  ],
  buildPrompt({ task, brain, inputs, overrides }) {
    return [
      "You are drafting the financials narrative for a startup's board update. The audience is investors and the founding team: they want the takeaway fast, then the math.",
      decisionsClause(brain.recent_decisions),
      vendorsClause(brain.vendors),
      metricsClause(brain.metrics),
      "",
      FINANCE_NARRATIVE_CONTRACT,
      "",
      `Task: ${task}`,
      `Period: ${inputs.period ?? "(unspecified)"}`,
      "The numbers the user provided (use ONLY these, plus anything in memory above):",
      inputs.numbers ?? "(none)",
      inputs.context ? `What the user already knows moved: ${inputs.context}` : "",
      "",
      "Produce a board financials document with this structure:",
      "  # <period> financials",
      "  ",
      "  ## Summary",
      "  Two or three sentences. The state of the business in financial terms. A board",
      "  member should be able to read only this and know if things are on track.",
      "  ",
      "  ## The numbers",
      "  A table of the headline actuals. Where you have a prior period or a plan number,",
      "  show the delta. Only include figures the user gave you or that are in memory.",
      "  ",
      "  ## What changed and why",
      "  For each meaningful move, one bullet. Tag each as **[timing]** or **[structural]**.",
      "  State the assumption behind any number you derived.",
      "  ",
      "  ## What it means",
      "  The implication for the next two quarters. Runway, hiring capacity, the next",
      "  decision the numbers force.",
      "  ",
      "  ## Open questions",
      "  Any figure you needed but the user didn't provide. Be explicit — do not estimate.",
      "",
      "Constraints:",
      "- Never invent or estimate a number. Missing figure -> Open questions.",
      "- Every derived number states its assumption inline.",
      "- Tag every move as timing or structural. Reviewers act on that distinction.",
      "- Plain, direct language. No 'we are pleased to report'.",
      FINANCE_CITATION_INSTRUCTION,
      overridesClause(overrides ?? []),
      "",
      outputAsDoc("Board Financials"),
    ]
      .filter(Boolean)
      .join("\n");
  },
};

registerFinanceTemplate(template);
export default template;
