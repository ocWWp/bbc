import { registerWritebackEmitter } from "./registry";
import {
  blocksToMarkdown,
  insertAuditArtifact,
  type WritebackEmitter,
} from "./types";

// founder:weekly-recap writeback. Audit-only.
//
// A weekly recap is narrative, not fact. The audit row becomes the team's
// searchable "what we said about each week" record. A v1.1 consolidator
// can mine recurring blockers ("help wanted" across N weeks -> a decision
// or roadmap proposal) -- deferred until we have multi-run aggregation.

const emitter: WritebackEmitter = {
  templateId: "founder:weekly-recap",
  async emit(ctx, supabase) {
    const recap = blocksToMarkdown(ctx.outputBlocks);
    const highlights = (ctx.inputs.highlights ?? "").trim();
    const blockers = (ctx.inputs.blockers ?? "").trim();
    const now = new Date().toISOString();

    const title = `Weekly recap: ${now.slice(0, 10)}`;
    const content = [
      `# ${title}`,
      ``,
      highlights ? `**Highlights (founder input):** ${highlights}` : "",
      blockers ? `**Blockers (founder input):** ${blockers}` : "",
      `**Source run:** ${ctx.runId}`,
      `**Accepted at:** ${now}`,
      ``,
      `## Recap (accepted)`,
      ``,
      recap,
    ]
      .filter(Boolean)
      .join("\n");

    const summary = `Weekly recap for week ending ${now.slice(0, 10)}`;
    const artifact = await insertAuditArtifact(supabase, ctx, { title, content, summary });
    return { proposals: [], artifacts: artifact ? [artifact] : [] };
  },
};

registerWritebackEmitter(emitter);
export default emitter;
