import { registerWritebackEmitter } from "./registry";
import {
  blocksToMarkdown,
  insertAuditArtifact,
  type WritebackEmitter,
} from "./types";

// design:visual-spec writeback. Audit-only.
//
// A visual spec is per-feature and ephemeral; it doesn't generalize to a
// brain-level fact. The audit row gives the team a searchable record of
// "what did we spec for the X surface?" -- useful when revisiting the
// surface months later. A v1.1 consolidator could mine specs for recurring
// component-state patterns (loading / empty / error treatments) and propose
// them as brand-guideline entries, but that's deferred.

const emitter: WritebackEmitter = {
  templateId: "design:visual-spec",
  async emit(ctx, supabase) {
    const spec = blocksToMarkdown(ctx.outputBlocks);
    const feature = (ctx.inputs.feature ?? "").trim() || "(unnamed feature)";
    const goal = (ctx.inputs.goal ?? "").trim();
    const constraints = (ctx.inputs.constraints ?? "").trim();
    const now = new Date().toISOString();

    const title = `Visual spec: ${feature}`;
    const content = [
      `# ${title}`,
      ``,
      `**Feature:** ${feature}`,
      goal ? `**User goal:** ${goal}` : "",
      constraints ? `**Constraints:** ${constraints}` : "",
      `**Source run:** ${ctx.runId}`,
      `**Accepted at:** ${now}`,
      ``,
      `## Spec (accepted)`,
      ``,
      spec,
    ]
      .filter(Boolean)
      .join("\n");

    const summary = `Visual spec for ${feature}${goal ? ` — goal: ${goal.slice(0, 120)}` : ""}`;
    const artifact = await insertAuditArtifact(supabase, ctx, { title, content, summary });
    return { proposals: [], artifacts: artifact ? [artifact] : [] };
  },
};

registerWritebackEmitter(emitter);
export default emitter;
