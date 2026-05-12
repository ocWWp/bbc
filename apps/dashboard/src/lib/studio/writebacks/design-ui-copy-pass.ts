import { registerWritebackEmitter } from "./registry";
import {
  blocksToMarkdown,
  insertAuditArtifact,
  type WritebackEmitter,
} from "./types";

// design:ui-copy-pass writeback. Audit-only for v1.
//
// The high-value follow-up is propagating the "Don't ship" patterns into
// the voice memory's dont_words/anti-patterns. That requires either (a)
// structured output (the template currently emits free markdown) or (b)
// LLM-driven extraction at writeback time. Both are reasonable v1.1 paths.
// For v1, audit-only -- each copy pass becomes searchable history, and the
// founder can hand-update voice when patterns recur.

const emitter: WritebackEmitter = {
  templateId: "design:ui-copy-pass",
  async emit(ctx, supabase) {
    const review = blocksToMarkdown(ctx.outputBlocks);
    const surface = (ctx.inputs.surface ?? "").trim() || "(unspecified surface)";
    const strings = (ctx.inputs.strings ?? "").trim();
    const now = new Date().toISOString();

    const title = `UI copy pass: ${surface}`;
    const content = [
      `# ${title}`,
      ``,
      `**Surface:** ${surface}`,
      `**Source run:** ${ctx.runId}`,
      `**Accepted at:** ${now}`,
      ``,
      `## Strings audited (input)`,
      ``,
      "```",
      strings.slice(0, 4000),
      "```",
      ``,
      `## Pass (accepted)`,
      ``,
      review,
    ]
      .filter(Boolean)
      .join("\n");

    const summary = `UI copy pass on ${surface}`;
    const artifact = await insertAuditArtifact(supabase, ctx, { title, content, summary });
    return { proposals: [], artifacts: artifact ? [artifact] : [] };
  },
};

registerWritebackEmitter(emitter);
export default emitter;
