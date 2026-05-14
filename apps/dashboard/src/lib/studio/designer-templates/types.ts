// Designer Studio template contract. Reuses marketing template types --
// designer outputs are documents (markdown specs, guideline entries) so the
// "plain" OutputBlock is the right vehicle. The shared brain summary works
// here too; designer prompts emphasize voice + product over decisions.

import type {
  Template,
  FirstUseInput,
  BrainSummary,
  BuildPromptArgs,
  OverrideRule,
} from "../templates/types";

export type { Template, FirstUseInput, BrainSummary, BuildPromptArgs, OverrideRule };

// Merge active tenant customizations into the prompt body. Designer reuses the
// marketing helper unchanged -- an override rule is role-agnostic.
export { overridesClause } from "../templates/types";

export function voiceClause(voice: BrainSummary["voice"]): string {
  if (!voice) {
    return "Voice: not documented. Default to neutral, direct, no marketing jargon.";
  }
  const parts = [`Voice register: ${voice.register}.`];
  if (voice.do_words?.length) {
    parts.push(`Words to use when natural: ${voice.do_words.slice(0, 8).join(", ")}.`);
  }
  if (voice.dont_words?.length) {
    parts.push(`Words to avoid: ${voice.dont_words.slice(0, 8).join(", ")}.`);
  }
  if (voice.example_phrases?.length) {
    parts.push(
      `Example phrases for tone: ${voice.example_phrases
        .slice(0, 3)
        .map((p) => `"${p}"`)
        .join(" / ")}.`,
    );
  }
  return parts.join(" ");
}

export function productClause(product: BrainSummary["product"]): string {
  if (!product) return "Product positioning: (not yet documented).";
  const diff = product.differentiators?.length
    ? ` Differentiators: ${product.differentiators.join("; ")}.`
    : "";
  return `Product: ${product.positioning} Target user: ${product.target_user}.${diff}`;
}

export function decisionsClause(decisions: BrainSummary["recent_decisions"]): string {
  if (!decisions?.length) return "";
  const lines = decisions.slice(0, 3).map((d) => `- ${d.title}: ${d.decision}`);
  return `Recent decisions that may inform the visual treatment:\n${lines.join("\n")}`;
}

export const DESIGN_CITATION_INSTRUCTION = `
Inline memory citations: when a sentence is materially shaped by a memory
(voice memory, product positioning, prior design decision), add a
<cite mem_id="..."/> tag with the exact uuid. Never invent ids. Designer
documents typically cite 2-5 memories.
`.trim();

export const OUTPUT_AS_PLAIN_MARKDOWN = `
Output as a single tool_use call with one OutputBlock of kind 'plain' and
props { text: string }. The text is the full markdown document with
# headings, **bold**, lists, and any tables you need.
`.trim();
