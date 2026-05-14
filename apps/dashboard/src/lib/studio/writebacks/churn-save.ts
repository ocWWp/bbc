import { registerWritebackEmitter } from "./registry";
import {
  blocksToMarkdown,
  insertAuditArtifact,
  type WritebackEmitter,
} from "./types";

// churn-save writeback. Audit-only for v1.
//
// Per the research SUMMARY, churn-save's flywheel paths are:
//   1. Cancellation-reason ledger (one row per accepted run) -- shipped
//      here as the source_artifact audit row.
//   2. Objection-pattern aggregation (after N=5 accepted runs, cluster
//      reasons and surface a proposal updating support/objection-patterns)
//      -- DEFERRED to v1.1, requires multi-run aggregation.
//   3. Decision-stress-testing (if the same decision gets cited + softened
//      across 3+ accepted runs, propose reviewing the decision threshold)
//      -- DEFERRED to v1.1, also multi-run.
//
// The audit row is enough to make those follow-ups buildable: a future
// consolidator job reads accepted source_artifact rows tagged
// 'support/churn-save' and proposes the higher-order patterns.

const emitter: WritebackEmitter = {
  templateId: "support:churn-save",
  async emit(ctx, supabase) {
    const reply = blocksToMarkdown(ctx.outputBlocks);
    const cancellation = (ctx.inputs.cancellation_message ?? "").trim();
    const customerName = (ctx.inputs.customer_name ?? "").trim() || "(unnamed)";
    const tenure = (ctx.inputs.tenure ?? "").trim();
    const plan = (ctx.inputs.plan ?? "").trim();
    const allowedOffers = (ctx.inputs.allowed_offers ?? "").trim();
    const now = new Date().toISOString();

    const title = `Churn-save: ${customerName}${plan ? ` (${plan})` : ""}`;
    const content = [
      `# ${title}`,
      ``,
      `**Customer:** ${customerName}`,
      tenure ? `**Tenure:** ${tenure}` : "",
      plan ? `**Plan/tier:** ${plan}` : "",
      allowedOffers ? `**Offers permitted this run:** ${allowedOffers}` : "**Offers permitted this run:** (defaults)",
      `**Source run:** ${ctx.runId}`,
      `**Accepted at:** ${now}`,
      `**Outcome:** pending (founder updates after customer responds)`,
      ``,
      `## Cancellation message`,
      ``,
      "```",
      cancellation,
      "```",
      ``,
      `## Drafted reply (accepted)`,
      ``,
      reply,
    ]
      .filter(Boolean)
      .join("\n");

    const summary = `Churn-save reply to ${customerName}${plan ? ` on ${plan}` : ""}. Reason: ${cancellation.slice(0, 200)}`;
    const artifact = await insertAuditArtifact(supabase, ctx, { title, content, summary });
    return { proposals: [], artifacts: artifact ? [artifact] : [] };
  },
};

registerWritebackEmitter(emitter);
export default emitter;
