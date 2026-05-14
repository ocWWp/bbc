import {
  decisionsClause,
  teamClause,
  FOUNDER_CITATION_INSTRUCTION,
  OUTPUT_AS_PLAIN_MARKDOWN,
  type Template,
} from "./types";
import { registerFounderTemplate } from "./registry";

const template: Template = {
  id: "founder:weekly-recap",
  label: "Weekly recap",
  hint: "Internal weekly recap for the team. Picks this for 'wrap up the week', 'team email', 'Friday roundup'.",
  kind: "plain",
  firstUseInputs: [
    {
      id: "highlights",
      label: "Highlights",
      hint: "What were the wins this week? (1 per line — let the agent shape them)",
      required: true,
      kind: "text",
    },
    {
      id: "blockers",
      label: "Blockers",
      hint: "What's stuck and needs help next week?",
      required: false,
      kind: "text",
    },
  ],
  buildPrompt({ task, brain, inputs }) {
    return [
      "You are drafting a weekly recap email from a startup founder to the team.",
      decisionsClause(brain.recent_decisions),
      teamClause(brain.team),
      "",
      `Task: ${task}`,
      `Highlights the founder shared: ${inputs.highlights ?? "(none provided)"}`,
      inputs.blockers ? `Blockers: ${inputs.blockers}` : "",
      "",
      "Structure:",
      "  Subject: This week at <Company> — <week-ending date or theme>",
      "  ",
      "  ## Wins",
      "  3-5 bullets. Call out the person who shipped each win by name when known.",
      "  ",
      "  ## What's next",
      "  Top 3 priorities for next week.",
      "  ",
      "  ## Help wanted",
      "  Blockers and asks. Be specific about who can help with what.",
      "  ",
      "  ## One thing I'm thinking about",
      "  One paragraph from the founder — something they're chewing on. Connects the team to strategic context.",
      "",
      "Constraints:",
      "- Warm but not gushing. Specific, not generic.",
      "- Name people when the brain has team memories that fit.",
      "- 300-500 words total. This is a quick read, not a doc.",
      FOUNDER_CITATION_INSTRUCTION,
      "",
      OUTPUT_AS_PLAIN_MARKDOWN,
    ]
      .filter(Boolean)
      .join("\n");
  },
};

registerFounderTemplate(template);
export default template;
