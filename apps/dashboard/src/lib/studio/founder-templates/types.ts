// Founder Studio template contract. Reuses marketing types -- founder
// templates produce strategic documents (memos, board updates, weekly recaps)
// using the team's decisions, product positioning, and team composition as
// primary context.

import type {
  Template,
  FirstUseInput,
  BrainSummary,
  BuildPromptArgs,
  OverrideRule,
} from "../templates/types";

export type { Template, FirstUseInput, BrainSummary, BuildPromptArgs, OverrideRule };

export function productClause(product: BrainSummary["product"]): string {
  if (!product) return "Product positioning: (not yet documented).";
  const diff = product.differentiators?.length
    ? ` Differentiators: ${product.differentiators.join("; ")}.`
    : "";
  return `Product: ${product.positioning} Target user: ${product.target_user}.${diff}`;
}

export function decisionsClause(decisions: BrainSummary["recent_decisions"]): string {
  if (!decisions?.length) return "Recent decisions: (none recorded).";
  const lines = decisions.slice(0, 5).map((d) => `- ${d.title}: ${d.decision}`);
  return `Recent decisions (cite mem_id when material):\n${lines.join("\n")}`;
}

export function teamClause(team: BrainSummary["team"]): string {
  if (!team?.length) return "Team: (not yet documented).";
  const lines = team.slice(0, 8).map((m) => `- ${m.name} (${m.role})`);
  return `Team:\n${lines.join("\n")}`;
}

export const FOUNDER_CITATION_INSTRUCTION = `
Inline memory citations: when a sentence is materially shaped by a memory
(decision, product positioning, team member, vendor relationship), add a
<cite mem_id="..."/> tag with the exact uuid. Never invent ids. Founder
documents typically cite 3-8 memories.
`.trim();

export const OUTPUT_AS_PLAIN_MARKDOWN = `
Output as a single tool_use call with one OutputBlock of kind 'plain' and
props { text: string }. The text is the full markdown document with
# headings, **bold**, lists, and any tables you need.
`.trim();
