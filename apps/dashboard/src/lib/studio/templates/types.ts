// Marketing Studio template contract. Each template is a hand-authored .ts
// file under src/lib/studio/templates/ that exports a `Template` object.
// See ADR-0006 for why this is code, not memory_files.

export type PreviewKind =
  | "x_post"
  | "x_thread"
  | "threads_post"
  | "linkedin_post"
  | "blog_draft"
  | "script"
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
