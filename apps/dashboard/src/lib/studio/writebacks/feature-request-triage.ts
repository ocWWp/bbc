import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { tokenize } from "@/lib/studio/support-templates/retrieval";
import {
  blocksToMarkdown,
  proposalId,
  registerWritebackEmitter,
  slugify,
  type FiledArtifact,
  type FiledProposal,
  type WritebackContext,
  type WritebackEmitter,
  type WritebackResult,
} from "./index";

// feature-request-triage writeback. THE BBC three-loop flywheel demo.
//
// On accept, three writeback paths fire:
//
//   1. ALWAYS: append a row to product/feature-request-log.md by creating a
//      queue_items proposal targeting that file. The first time it fires,
//      the proposal creates the file with a single entry; subsequent runs
//      against the same slug increment a counter. (For v1 we always file a
//      fresh proposal -- the consolidator that merges them is a follow-up.)
//      Plus an immediate source_artifact row in memory_files capturing
//      task + reply + verdict for audit history.
//
//   2. CONDITIONAL (verdict=wont-build AND no decision matches): propose a
//      new ADR. Body is a minimal ADR-NNNN shell with the feature summary,
//      one-sentence reasoning extracted from the reply, and a Decision
//      section the founder fills in before accepting.
//
//   3. CONDITIONAL (verdict=already-shipped AND retrieval found nothing):
//      propose a roadmap_status correction. The founder asserted via the
//      override that the brain is stale; this proposal updates the
//      relevant product memory's status field.
//
// All proposals carry source_run_id in frontmatter so the queue can link
// back. None of them are auto-accepted -- they sit in /queue for human
// review, per CLAUDE.md principle #6 (no silent autonomy).

const TEMPLATE_ID = "support:feature-request-triage";

type SupabaseDb = SupabaseClient<Database>;

const emitter: WritebackEmitter = {
  templateId: TEMPLATE_ID,
  async emit(ctx: WritebackContext, supabase: SupabaseDb): Promise<WritebackResult> {
    const proposals: FiledProposal[] = [];
    const artifacts: FiledArtifact[] = [];

    const featureSummary = (ctx.inputs.feature_summary ?? "").trim();
    const verdict = (ctx.inputs.verdict ?? "auto").trim() || "auto";
    const requestText = (ctx.inputs.request_text ?? "").trim();
    const replyText = blocksToMarkdown(ctx.outputBlocks);
    const featureLabel = featureSummary || requestText.split("\n")[0]!.slice(0, 80) || "untitled feature";
    const slug = slugify(featureLabel);
    const now = new Date().toISOString();

    // (a) ALWAYS: source_artifact row for the audit trail. Direct insert
    // because audit history is not a brain-fact-change -- it's a record of
    // what happened.
    const artifactTitle = `Feature request triage: ${featureLabel.slice(0, 60)}`;
    const { data: artifactRow } = await supabase
      .from("memory_files")
      .insert({
        tenant_id: ctx.tenantId,
        type: "source_artifact" as Database["public"]["Enums"]["memory_type"],
        title: artifactTitle.slice(0, 200),
        content: [
          `# ${artifactTitle}`,
          ``,
          `**Verdict:** ${verdict}`,
          `**Source run:** ${ctx.runId}`,
          `**Filed at:** ${now}`,
          ``,
          `## Customer request`,
          ``,
          "```",
          requestText.slice(0, 4000),
          "```",
          ``,
          `## Drafted reply (accepted)`,
          ``,
          replyText.slice(0, 4000),
        ].join("\n"),
        fields: {
          source_kind: "text",
          summary: `Feature request: ${featureLabel}. Verdict: ${verdict}.`,
        } as Database["public"]["Tables"]["memory_files"]["Insert"]["fields"],
        status: "active" as Database["public"]["Enums"]["memory_status"],
        path: `studio-runs/${ctx.runId}.md`,
      })
      .select("id")
      .single();
    if (artifactRow) {
      artifacts.push({
        memory_id: (artifactRow as { id: string }).id,
        type: "source_artifact",
        title: artifactTitle,
      });
    }

    // (b) ALWAYS: propose appending this request to the feature-request log.
    // Filed as a queue_items proposal, NOT a direct write -- the founder
    // accepts/rejects from /queue.
    const logPropId = proposalId("feat-log", slug);
    const logBody = [
      `# Feature request: ${featureLabel}`,
      ``,
      `Append this to \`memory/product/feature-request-log.md\` (or create the file if it doesn't exist).`,
      ``,
      `## Entry`,
      ``,
      `- **Slug:** \`${slug}\``,
      `- **Verdict:** ${verdict}`,
      `- **First seen:** ${now.slice(0, 10)}`,
      `- **Source run:** ${ctx.runId}`,
      ``,
      `### Customer's request`,
      ``,
      `> ${requestText.split("\n").slice(0, 4).join(" ").slice(0, 600)}`,
      ``,
      `### Drafted reply (accepted)`,
      ``,
      replyText.slice(0, 1500),
    ].join("\n");
    const { error: logErr } = await supabase.from("queue_items").insert({
      tenant_id: ctx.tenantId,
      proposal_id: logPropId,
      status: "pending",
      body: logBody,
      frontmatter: {
        proposed_by: ctx.userActor,
        proposed_at: now,
        target_layer: "manager",
        target_file: "memory/product/feature-request-log.md",
        change_kind: "add",
        diff_summary: `Log feature request "${featureLabel}" (verdict: ${verdict}).`,
        source: `studio:${TEMPLATE_ID}`,
        source_run_id: ctx.runId,
      },
    });
    if (!logErr) {
      proposals.push({
        proposal_id: logPropId,
        target_file: "memory/product/feature-request-log.md",
        diff_summary: `Log feature request "${featureLabel}".`,
      });
    }

    // (c) CONDITIONAL: verdict=wont-build AND no covering decision exists.
    // The check for "no covering decision" reuses the same word-overlap
    // probe the template uses at retrieval time -- if nothing matched, the
    // brain has nothing on this and the ADR fills the gap.
    if (verdict === "wont-build") {
      const hasCoveringDecision = await hasMatchingDecision(
        supabase,
        ctx.tenantId,
        featureLabel,
      );
      if (!hasCoveringDecision) {
        const adrPropId = proposalId("adr", slug);
        const adrBody = [
          `# ADR-NNNN: We will not build ${featureLabel}`,
          ``,
          `**Status:** Proposed`,
          `**Date:** ${now.slice(0, 10)}`,
          `**Deciders:** (founder to fill in)`,
          ``,
          `## Context`,
          ``,
          `Customers have asked for ${featureLabel}. As of ${now.slice(0, 10)}, no decision in the brain explicitly addresses this; the founder responded "won't build" through Support Studio's feature-request-triage on run \`${ctx.runId}\`.`,
          ``,
          `## Customer request (representative)`,
          ``,
          `> ${requestText.split("\n").slice(0, 4).join(" ").slice(0, 600)}`,
          ``,
          `## Decision`,
          ``,
          `We will not build ${featureLabel}.`,
          ``,
          `## Consequences`,
          ``,
          `(Founder to fill in -- what gets easier, what gets harder, what we're locking ourselves into. The reply drafted by the studio implied the following reasoning, which the founder should review:)`,
          ``,
          replyText.slice(0, 1500),
        ].join("\n");

        const { error: adrErr } = await supabase.from("queue_items").insert({
          tenant_id: ctx.tenantId,
          proposal_id: adrPropId,
          status: "pending",
          body: adrBody,
          frontmatter: {
            proposed_by: ctx.userActor,
            proposed_at: now,
            target_layer: "main",
            target_file: `memory/decisions/NNNN-wont-build-${slug}.md`,
            change_kind: "add",
            diff_summary: `Propose ADR codifying the "won't build ${featureLabel}" stance.`,
            source: `studio:${TEMPLATE_ID}`,
            source_run_id: ctx.runId,
          },
        });
        if (!adrErr) {
          proposals.push({
            proposal_id: adrPropId,
            target_file: `memory/decisions/NNNN-wont-build-${slug}.md`,
            diff_summary: `Codify the "won't build" stance.`,
          });
        }
      }
    }

    // (d) CONDITIONAL: verdict=already-shipped. The founder asserted the
    // brain is stale (the studio's retrieval probe didn't find a matching
    // shipped capability, otherwise the studio would have inferred the
    // verdict automatically). Propose a roadmap_status correction.
    if (verdict === "already-shipped") {
      const productRow = await loadPrimaryProduct(supabase, ctx.tenantId);
      if (productRow) {
        const statusPropId = proposalId("roadmap", slug);
        const statusBody = [
          `# Roadmap status correction: ${featureLabel}`,
          ``,
          `Update \`${productRow.path}\` to reflect that ${featureLabel} has shipped.`,
          ``,
          `## Why`,
          ``,
          `Support Studio's feature-request-triage couldn't find ${featureLabel} in product memory, but the founder marked the verdict as "already-shipped" on run \`${ctx.runId}\`. The brain is stale on this feature.`,
          ``,
          `## Suggested change`,
          ``,
          `Add or update an entry in product memory marking ${featureLabel} as Released. Example differentiator line to add to \`differentiators\` if not already present:`,
          ``,
          `- ${featureLabel}`,
          ``,
          `(Founder reviews wording before accepting.)`,
          ``,
          `## Customer request (representative)`,
          ``,
          `> ${requestText.split("\n").slice(0, 4).join(" ").slice(0, 600)}`,
        ].join("\n");

        const { error: statusErr } = await supabase.from("queue_items").insert({
          tenant_id: ctx.tenantId,
          proposal_id: statusPropId,
          status: "pending",
          body: statusBody,
          frontmatter: {
            proposed_by: ctx.userActor,
            proposed_at: now,
            target_layer: "manager",
            target_file: productRow.path,
            change_kind: "edit",
            diff_summary: `Mark ${featureLabel} as Released in product memory.`,
            source: `studio:${TEMPLATE_ID}`,
            source_run_id: ctx.runId,
            target_memory_id: productRow.id,
          },
        });
        if (!statusErr) {
          proposals.push({
            proposal_id: statusPropId,
            target_file: productRow.path,
            diff_summary: `Mark ${featureLabel} as Released.`,
          });
        }
      }
    }

    return { proposals, artifacts };
  },
};

// Decision-overlap probe: same idea as findRelevantDecisions in retrieval.ts
// but operating directly against memory_files (the runtime BrainSummary cap
// of 5 might exclude an older covering decision -- we want the full check).
async function hasMatchingDecision(
  supabase: SupabaseDb,
  tenantId: string,
  query: string,
): Promise<boolean> {
  const qTokens = tokenize(query);
  if (qTokens.size === 0) return false;
  const { data } = await supabase
    .from("memory_files")
    .select("title, content")
    .eq("tenant_id", tenantId)
    .eq("type", "decision")
    .eq("status", "active")
    .limit(50);
  type Row = { title: string | null; content: string | null };
  for (const row of (data ?? []) as Row[]) {
    const rowTokens = tokenize(`${row.title ?? ""} ${row.content ?? ""}`);
    let hits = 0;
    for (const t of qTokens) if (rowTokens.has(t)) hits++;
    if (hits >= 2) return true;
  }
  return false;
}

async function loadPrimaryProduct(
  supabase: SupabaseDb,
  tenantId: string,
): Promise<{ id: string; path: string } | null> {
  const { data } = await supabase
    .from("memory_files")
    .select("id, path")
    .eq("tenant_id", tenantId)
    .eq("type", "product")
    .eq("status", "active")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data
    ? { id: (data as { id: string; path: string }).id, path: (data as { id: string; path: string }).path }
    : null;
}

registerWritebackEmitter(emitter);
export default emitter;
