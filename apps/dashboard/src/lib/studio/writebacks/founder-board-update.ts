import { registerWritebackEmitter } from "./registry";
import {
  blocksToMarkdown,
  insertAuditArtifact,
  type WritebackEmitter,
} from "./types";

// founder:board-update writeback. Audit-only.
//
// A board update is a point-in-time artifact, not a brain mutation -- the
// numbers and shipped work it summarizes already live (or should live) in
// product / decision memory. The audit row makes past updates searchable
// for next month's draft ("what did I tell them last time?") and feeds a
// v1.1 consolidator that could surface "we promised X last month and
// haven't said anything about it since."

const emitter: WritebackEmitter = {
  templateId: "founder:board-update",
  async emit(ctx, supabase) {
    const update = blocksToMarkdown(ctx.outputBlocks);
    const period = (ctx.inputs.period ?? "").trim() || "(unspecified period)";
    const metric = (ctx.inputs.key_metric ?? "").trim();
    const ask = (ctx.inputs.ask ?? "").trim();
    const now = new Date().toISOString();

    const title = `Board update: ${period}`;
    const content = [
      `# ${title}`,
      ``,
      `**Period:** ${period}`,
      metric ? `**Headline metric:** ${metric}` : "",
      ask ? `**Ask:** ${ask}` : "",
      `**Source run:** ${ctx.runId}`,
      `**Accepted at:** ${now}`,
      ``,
      `## Update (accepted)`,
      ``,
      update,
    ]
      .filter(Boolean)
      .join("\n");

    const summary = `Board update for ${period}${metric ? ` — headline: ${metric}` : ""}`;
    const artifact = await insertAuditArtifact(supabase, ctx, { title, content, summary });
    return { proposals: [], artifacts: artifact ? [artifact] : [] };
  },
};

registerWritebackEmitter(emitter);
export default emitter;
