import {
  teamClause,
  decisionsClause,
  compBandsClause,
  overridesClause,
  HR_CITATION_INSTRUCTION,
  HR_SENSITIVITY_CONTRACT,
  outputAsDoc,
  type Template,
} from "./types";
import { registerHrTemplate } from "./registry";

const template: Template = {
  id: "hr:offer-letter",
  label: "Offer letter",
  hint: "Draft an offer letter for a candidate. Picks this for 'offer letter for the new engineer', 'write up the offer', 'send an offer to [name]'.",
  kind: "doc",
  firstUseInputs: [
    {
      id: "candidate",
      label: "Candidate & role",
      hint: "Who the offer is for and the role/level. (e.g. 'Jordan Lee, Senior Backend Engineer')",
      required: true,
      kind: "text",
    },
    {
      id: "terms",
      label: "Offer terms",
      hint: "Salary, equity, start date, reporting line — whatever's been agreed. The Studio will not invent comp numbers.",
      required: true,
      kind: "text",
    },
    {
      id: "context",
      label: "Specifics",
      hint: "Benefits highlights, location/remote, signing details, anything you want reflected.",
      required: false,
      kind: "text",
    },
  ],
  buildPrompt({ task, brain, inputs, overrides }) {
    return [
      "You are drafting an offer letter for a startup. The tone is warm and concrete; the content is accurate and never overstated.",
      HR_SENSITIVITY_CONTRACT,
      "",
      teamClause(brain.team),
      decisionsClause(brain.recent_decisions),
      compBandsClause(brain.comp_bands),
      "",
      `Task: ${task}`,
      `Candidate & role: ${inputs.candidate ?? "(unspecified)"}`,
      `Offer terms: ${inputs.terms ?? "(unspecified)"}`,
      inputs.context ? `Specifics: ${inputs.context}` : "",
      "",
      "Produce an offer letter with this structure:",
      "  # Offer of employment — <role>",
      "  ",
      "  A warm opening line. Then:",
      "  - **Role & reporting** — title, who they report to.",
      "  - **Compensation** — salary, equity, any signing terms. Use ONLY the",
      "    numbers the user gave you; everything unknown is a [BRACKETED] placeholder.",
      "  - **Start date**",
      "  - **Benefits** — high level; [BRACKETED] where unknown.",
      "  - **What happens next** — the steps to accept.",
      "  ",
      "  ## Loop in counsel",
      "  A required callout: this is an offer letter, NOT the employment agreement.",
      "  The binding employment terms, at-will language, and IP/confidentiality",
      "  agreement are separate documents — point the user to the Legal Studio and",
      "  note an attorney should review the employment agreement.",
      "  ",
      "  ## Before you send",
      "  Every [BRACKETED] value to fill, and a reminder to confirm the comp figures.",
      "",
      "Constraints:",
      "- Never invent salary, equity, or benefit numbers. Unknown -> [BRACKETED].",
      "- Do not claim the letter is binding or constitutes the employment contract.",
      "- Warm, but no overpromising about the company's future.",
      HR_CITATION_INSTRUCTION,
      overridesClause(overrides ?? []),
      "",
      outputAsDoc("Offer Letter"),
    ]
      .filter(Boolean)
      .join("\n");
  },
};

registerHrTemplate(template);
export default template;
