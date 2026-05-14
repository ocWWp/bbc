import {
  decisionsClause,
  vendorsClause,
  ENG_CITATION_INSTRUCTION,
  OUTPUT_AS_PLAIN_MARKDOWN,
  type Template,
} from "./types";
import { registerEngTemplate } from "./registry";

const template: Template = {
  id: "eng:tech-debt-review",
  label: "Tech-debt review",
  hint: "Surface tech debt in a subsystem and rank it. Picks this for 'what's slowing us down in X', 'audit the Y codebase', 'where should we refactor next'.",
  kind: "plain",
  firstUseInputs: [
    {
      id: "subsystem",
      label: "Subsystem",
      hint: "Which area? (e.g. 'auth flow', 'studio prompt assembly', 'ingestion adapters').",
      required: true,
      kind: "text",
    },
    {
      id: "symptoms",
      label: "Symptoms (optional)",
      hint: "What's hurting? Slow PRs, frequent bugs, onboarding friction, perf cliffs?",
      required: false,
      kind: "text",
    },
  ],
  buildPrompt({ task, brain, inputs }) {
    return [
      "You are reviewing a software team's tech debt in a specific subsystem.",
      decisionsClause(brain.recent_decisions),
      vendorsClause(brain.vendors),
      "",
      `Task: ${task}`,
      `Subsystem: ${inputs.subsystem ?? "(unspecified)"}`,
      inputs.symptoms ? `Symptoms the team reports: ${inputs.symptoms}` : "",
      "",
      "Produce a tech-debt review with this structure:",
      "  # Tech debt review: <subsystem>",
      "  ",
      "  ## Summary",
      "  One paragraph. What's the dominant pattern of debt here?",
      "  ",
      "  ## Findings",
      "  Numbered list. For each finding:",
      "    - **Finding**: <name>",
      "    - **Why it hurts**: concrete impact (slows what, breaks when)",
      "    - **Severity**: high | medium | low",
      "    - **Suggested fix**: 1-2 sentences. Don't overspec.",
      "  Aim for 4-8 findings. Quality over quantity.",
      "  ",
      "  ## Quick wins",
      "  Findings that pay off within a sprint with low risk. Bullet list of 2-4.",
      "  ",
      "  ## Don't touch yet",
      "  Debt that looks tempting but isn't worth the risk now. Explain why.",
      "",
      "Constraints:",
      "- Avoid generic findings ('add more tests', 'refactor for readability'). Be specific to the subsystem.",
      "- If a prior decision codified this debt deliberately, acknowledge it -- don't recommend reversing a deliberate choice without strong evidence.",
      "- Don't suggest rewrites unless the math is overwhelming.",
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
