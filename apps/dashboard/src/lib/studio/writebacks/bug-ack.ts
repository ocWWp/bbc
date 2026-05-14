import { registerWritebackEmitter } from "./registry";
import {
  blocksToMarkdown,
  insertAuditArtifact,
  type WritebackEmitter,
} from "./types";

// bug-ack writeback. Audit-only for v1.
//
// Per the research SUMMARY, bug-ack's higher-value writeback is a
// known-bugs glossary proposal triggered when the same symptom recurs
// across 3+ accepted runs. That requires multi-run aggregation, so it's
// deferred to v1.1.
//
// What v1 ships now: every accepted ack lands as a source_artifact row
// carrying the original ticket, the reply, the severity + repro flag, and
// the cited memory_ids the studio surfaced (so the consolidator that
// builds known-bugs entries has the related-context links pre-resolved).

const emitter: WritebackEmitter = {
  templateId: "support:bug-ack",
  async emit(ctx, supabase) {
    const reply = blocksToMarkdown(ctx.outputBlocks);
    const ticket = (ctx.inputs.ticket_text ?? "").trim();
    const customerName = (ctx.inputs.customer_name ?? "").trim() || "(unnamed)";
    const canReproduce = (ctx.inputs.can_reproduce ?? "not_yet_tried").trim() || "not_yet_tried";
    const severity = (ctx.inputs.severity ?? "medium").trim() || "medium";
    const knownRelatedId = (ctx.inputs.known_related_id ?? "").trim();
    const now = new Date().toISOString();

    const allRelatedIds = knownRelatedId
      ? [knownRelatedId, ...ctx.citedMemoryIds.filter((id) => id !== knownRelatedId)]
      : ctx.citedMemoryIds;

    const title = `Bug ack [${severity}]: ${customerName}`;
    const content = [
      `# ${title}`,
      ``,
      `**Severity:** ${severity}`,
      `**Can reproduce:** ${canReproduce}`,
      `**Source run:** ${ctx.runId}`,
      `**Accepted at:** ${now}`,
      allRelatedIds.length > 0
        ? `**Related memories cited:** ${allRelatedIds.join(", ")}`
        : "**Related memories cited:** (none)",
      ``,
      `## Bug report`,
      ``,
      "```",
      ticket,
      "```",
      ``,
      `## Drafted ack (accepted)`,
      ``,
      reply,
    ].join("\n");

    const summary = `Bug ack [${severity}, repro=${canReproduce}] to ${customerName}. Report: ${ticket.slice(0, 200)}`;
    const artifact = await insertAuditArtifact(supabase, ctx, { title, content, summary });
    return { proposals: [], artifacts: artifact ? [artifact] : [] };
  },
};

registerWritebackEmitter(emitter);
export default emitter;
