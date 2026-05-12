import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { registerWritebackEmitter } from "./registry";
import {
  blocksToMarkdown,
  insertAuditArtifact,
  proposalId,
  slugify,
  type FiledProposal,
  type WritebackEmitter,
} from "./types";

// founder:strategic-memo writeback.
//
// ALWAYS: audit row capturing the memo + the question it answered. Memos
// become searchable history for "what did we already think about X?"
//
// ALWAYS: propose an ADR derived from the memo. A strategic memo is the
// pre-decision shape -- it picks a side and recommends an action. The
// proposal wraps the memo as a draft ADR; the founder accepts only when
// they're ready to canonize the recommendation, otherwise rejects. This
// mirrors the eng:adr-draft flywheel from the founder side.

const TEMPLATE_ID = "founder:strategic-memo";

type SupabaseDb = SupabaseClient<Database>;

function extractTitle(markdown: string, fallback: string): string {
  const firstH1 = markdown.match(/^#\s+(.+?)\s*$/m);
  if (firstH1?.[1]) {
    return firstH1[1].replace(/^ADR-[N0-9-]+:\s*/i, "").trim().slice(0, 120);
  }
  return fallback.slice(0, 120);
}

const emitter: WritebackEmitter = {
  templateId: TEMPLATE_ID,
  async emit(ctx, supabase: SupabaseDb) {
    const memo = blocksToMarkdown(ctx.outputBlocks);
    const question = (ctx.inputs.question ?? "").trim() || "(unspecified question)";
    const audience = (ctx.inputs.audience ?? "").trim() || "leadership";
    const now = new Date().toISOString();

    const auditTitle = `Strategic memo: ${question.slice(0, 80)}`;
    const auditContent = [
      `# ${auditTitle}`,
      ``,
      `**Question:** ${question}`,
      `**Audience:** ${audience}`,
      `**Source run:** ${ctx.runId}`,
      `**Accepted at:** ${now}`,
      ``,
      `## Memo (accepted)`,
      ``,
      memo,
    ].join("\n");

    const auditSummary = `Strategic memo answering: ${question}`;
    const artifact = await insertAuditArtifact(supabase, ctx, {
      title: auditTitle,
      content: auditContent,
      summary: auditSummary,
    });

    const proposals: FiledProposal[] = [];
    const memoTitle = extractTitle(memo, question);
    const slug = slugify(memoTitle);
    const adrPropId = proposalId("memo-adr", slug);
    const adrBody = [
      `# ADR-NNNN: ${memoTitle}`,
      ``,
      `**Status:** Proposed`,
      `**Date:** ${now.slice(0, 10)}`,
      `**Deciders:** (founder to fill in)`,
      ``,
      `## Context`,
      ``,
      `Drafted from Founder Studio strategic-memo run \`${ctx.runId}\`. The memo below answers: _${question}_. Accepting this proposal canonizes the memo's recommendation as a decision. Edit the body before accepting if the recommendation needs sharpening.`,
      ``,
      `---`,
      ``,
      memo,
    ].join("\n");

    const { error } = await supabase.from("queue_items").insert({
      tenant_id: ctx.tenantId,
      proposal_id: adrPropId,
      status: "pending",
      body: adrBody,
      frontmatter: {
        proposed_by: ctx.userActor,
        proposed_at: now,
        target_layer: "main",
        target_file: `memory/decisions/NNNN-${slug}.md`,
        change_kind: "add",
        diff_summary: `Add ADR (from strategic memo): ${memoTitle}`,
        source: `studio:${TEMPLATE_ID}`,
        source_run_id: ctx.runId,
        memory_type: "decision",
        cited_memory_ids: ctx.citedMemoryIds,
      },
    });
    if (!error) {
      proposals.push({
        proposal_id: adrPropId,
        target_file: `memory/decisions/NNNN-${slug}.md`,
        diff_summary: `Add ADR (from strategic memo): ${memoTitle}`,
      });
    }

    return { proposals, artifacts: artifact ? [artifact] : [] };
  },
};

registerWritebackEmitter(emitter);
export default emitter;
