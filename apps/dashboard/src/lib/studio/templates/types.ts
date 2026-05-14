// Marketing Studio template contract. Each template is a hand-authored .ts
// file under src/lib/studio/templates/ that exports a `Template` object.
// See ADR-0006 for why this is code, not memory_files.

import type { StudioRole } from "@/lib/studio/template-id";

export type PreviewKind =
  | "x_post"
  | "x_thread"
  | "threads_post"
  | "linkedin_post"
  | "blog_draft"
  | "script"
  | "doc"
  | "plain";

export type FirstUseInputKind = "text" | "select" | "tone";

export type FirstUseInput = {
  id: string;
  label: string;
  hint: string;
  required: boolean;
  kind: FirstUseInputKind;
  // For "select" kind: the allowed options. For "tone": a curated subset of voice registers.
  options?: string[];
  // Optional default value rendered in the form.
  default?: string;
};

// Minimal brain context shape the templates use to build prompts. Templates
// don't reach into the DB themselves -- the server action assembles this
// summary and passes it in. Keeps templates pure functions.
export type BrainSummary = {
  product?: { positioning: string; target_user: string; differentiators: string[] };
  voice?: { register: string; do_words: string[]; dont_words: string[]; example_phrases: string[] };
  recent_decisions: Array<{ id: string; title: string; decision: string }>;
  vendors: Array<{ id: string; name: string; role: string }>;
  team: Array<{ id: string; name: string; role: string }>;
  // Canonical product vocabulary. Surfaced explicitly (instead of folding into
  // voice) so support templates can pin terms as "use exactly this word" while
  // marketing templates keep the looser voice contract. Optional -- a tenant
  // with no glossary memories gets `undefined` here, not an empty terms list.
  glossary?: { terms: Array<{ id: string; term: string; definition: string }> };
  // Finance Studio actuals -- board metrics, runway numbers, budget lines.
  // No memory type populates this yet: brain-summary.ts leaves it undefined,
  // so the Finance sidebar's metrics section stays hidden (BrainSidebar drops
  // empty sections). The role-shapes section + the finance metricsClause are
  // forward-wired so adding the `metric` memory type only touches brain-summary.ts.
  metrics?: Array<{ id: string; label: string; value: string }>;
  // People/HR Studio comp bands -- role -> salary/equity range. Same
  // forward-wired pattern as `metrics`: nothing populates it yet, so the HR
  // sidebar's comp-bands section stays hidden until a `comp_band` memory type
  // lands, at which point only brain-summary.ts changes.
  comp_bands?: Array<{ id: string; label: string; range: string }>;
};

// One active override row, shaped for prompt merging. The server action
// converts studio_template_overrides DB rows into this shape.
export type OverrideRule = {
  id: string;
  kind: "add_constraint" | "replace_section" | "add_example" | "forbid_pattern";
  value: Record<string, unknown>;
  summary: string;
};

export type BuildPromptArgs = {
  task: string;
  brain: BrainSummary;
  inputs: Record<string, string>;
  overrides: OverrideRule[];
};

export interface Template {
  id: string;
  label: string; // user-facing chip text
  hint: string; // single sentence: when the LLM should pick this
  kind: PreviewKind;
  firstUseInputs: FirstUseInput[];
  buildPrompt(args: BuildPromptArgs): string;
  // Additional roles to cross-list this template under in the gallery. The
  // OWNING role is always derived from the id prefix; `facets` is purely
  // additive surfacing. Optional -- most templates omit it.
  facets?: StudioRole[];
}

// Shared prompt fragment: instructs the LLM how to cite memories so the
// renderer can turn references into clickable footnotes.
export const CITATION_INSTRUCTION = `
Inline memory citations: whenever a sentence is materially shaped by a specific
memory in the brain, append a citation tag with the memory's id, e.g.
"our voice is direct and lowercase<cite mem_id="..."/>". Use the exact uuid from
the brain context, never invent one. Limit to 1-3 citations per output block.
`.trim();

// Shared prompt fragment: lists the do/don't words and example phrases so
// every template inherits the voice contract.
export function voiceClause(voice: BrainSummary["voice"]): string {
  if (!voice) return "Voice: neutral, professional. No marketing jargon.";
  const lines = [`Voice register: ${voice.register}.`];
  if (voice.do_words.length) lines.push(`Use these words when natural: ${voice.do_words.join(", ")}.`);
  if (voice.dont_words.length) lines.push(`NEVER use these words: ${voice.dont_words.join(", ")}.`);
  if (voice.example_phrases.length) lines.push(`Reference example phrases for tone: ${voice.example_phrases.slice(0, 3).map((p) => `"${p}"`).join(" / ")}.`);
  return lines.join(" ");
}

// Shared prompt fragment: merge active overrides into the prompt body. Each
// override gets a short, actionable sentence. v1 caps active overrides at
// 10/template/tenant in the server action; if more arrive they're truncated
// here as a defensive guard.
export function overridesClause(overrides: OverrideRule[]): string {
  if (overrides.length === 0) return "";
  const capped = overrides.slice(0, 10);
  const lines = capped.map((o) => {
    const v = o.value;
    switch (o.kind) {
      case "add_constraint":
        return `- Always: ${v.constraint ?? o.summary}`;
      case "replace_section":
        return `- Replace "${v.target ?? "section"}" with: ${v.replacement ?? o.summary}`;
      case "add_example":
        return `- Use this style example: ${v.example ?? o.summary}`;
      case "forbid_pattern":
        return `- Never use: ${v.pattern ?? o.summary}`;
    }
  });
  return `Tenant customizations (apply all):\n${lines.join("\n")}`;
}
