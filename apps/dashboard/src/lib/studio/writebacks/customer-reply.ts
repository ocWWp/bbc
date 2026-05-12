import { registerWritebackEmitter } from "./registry";
import {
  blocksToMarkdown,
  insertAuditArtifact,
  type WritebackEmitter,
} from "./types";

// customer-reply writeback. Audit-only for v1.
//
// Per the research SUMMARY, the high-value writeback for customer-reply is
// phrase mining: after N=10 accepted replies, cluster them into common-reply
// patterns that get promoted into glossary or a new common_reply memory
// type. That requires multi-run aggregation, so it's deferred to v1.1 / a
// follow-up "consolidator" pass that reads accepted source_artifact rows
// and proposes the patterns.
//
// What v1 ships now: every accepted reply lands as a searchable
// source_artifact row tagged 'support/customer-reply'. The consolidator
// can run over those rows whenever it's built.

const emitter: WritebackEmitter = {
  templateId: "support:customer-reply",
  async emit(ctx, supabase) {
    const reply = blocksToMarkdown(ctx.outputBlocks);
    const ticket = (ctx.inputs.ticket_text ?? "").trim();
    const customerName = (ctx.inputs.customer_name ?? "").trim() || "(unnamed)";
    const severity = (ctx.inputs.severity ?? "low").trim() || "low";
    const contextNote = (ctx.inputs.context_note ?? "").trim();
    const now = new Date().toISOString();

    const title = `Customer reply [${severity}]: ${customerName}`;
    const content = [
      `# ${title}`,
      ``,
      `**Severity:** ${severity}`,
      `**Source run:** ${ctx.runId}`,
      `**Accepted at:** ${now}`,
      contextNote ? `**Founder context:** ${contextNote}` : "",
      ``,
      `## Customer ticket`,
      ``,
      "```",
      ticket,
      "```",
      ``,
      `## Drafted reply (accepted)`,
      ``,
      reply,
    ]
      .filter(Boolean)
      .join("\n");

    const summary = `Customer reply to ${customerName} (severity=${severity}). Ticket: ${ticket.slice(0, 200)}`;
    const artifact = await insertAuditArtifact(supabase, ctx, { title, content, summary });
    return { proposals: [], artifacts: artifact ? [artifact] : [] };
  },
};

registerWritebackEmitter(emitter);
export default emitter;
