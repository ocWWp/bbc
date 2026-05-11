import {
  CITATION_INSTRUCTION,
  overridesClause,
  voiceClause,
  type Template,
} from "./types";
import { registerTemplate } from "./registry";

const template: Template = {
  id: "voice-consistency-check",
  label: "Voice consistency check",
  hint: "Takes a draft the founder already wrote and lints it against the brand voice memory. Picks this when the task mentions reviewing/checking/auditing existing copy.",
  kind: "plain",
  firstUseInputs: [
    {
      id: "draft",
      label: "Draft to check",
      hint: "Paste the text you want reviewed",
      required: true,
      kind: "text",
    },
  ],
  buildPrompt({ task, brain, inputs, overrides }) {
    return [
      "You are reviewing a draft for brand-voice consistency. You are NOT rewriting it -- you are flagging specific issues with line-level precision.",
      voiceClause(brain.voice),
      `Task context: ${task}`,
      "Draft to review:",
      "```",
      inputs.draft ?? "",
      "```",
      overridesClause(overrides),
      "",
      "Constraints:",
      "- For each issue, quote the exact phrase from the draft, name the rule it breaks (citing the voice memory id), and suggest a concrete replacement.",
      "- If the draft is clean, say so explicitly with a one-sentence note. Do not invent issues.",
      "- Sort issues by severity: 'forbidden word' > 'register mismatch' > 'phrasing improvement'.",
      "- Maximum 8 issues; if there are more, pick the highest-severity 8.",
      CITATION_INSTRUCTION,
      "",
      "Output as a single tool_use call with one OutputBlock of kind 'plain' and props { issues: Array<{ severity: 'high' | 'medium' | 'low'; quote: string; rule: string; suggestion: string }>; overall_verdict: string }.",
    ]
      .filter(Boolean)
      .join("\n");
  },
};

registerTemplate(template);
export default template;
