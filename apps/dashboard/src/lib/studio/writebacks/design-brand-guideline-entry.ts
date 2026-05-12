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

// design:brand-guideline-entry writeback. THE cleanest designer flywheel.
//
// A brand guideline IS a written-down decision about how the team handles
// a specific brand topic (color, typography, motion, voice, density...).
// The studio drafts the entry; on accept, the entry becomes a proposal to
// add a new `decision` memory row under memory/design/guidelines/<topic>.md.
// The founder reviews + accepts -> the guideline lands in the brain, where
// future studio runs cite it as prior decision.
//
// memory_type=decision is the closest enum fit (per database.types.ts the
// enum is voice|decision|glossary|vendor|product|team|skill). A future
// brand_guideline type is deferrable -- semantically, guidelines are policy
// decisions about visual / brand handling.

const TEMPLATE_ID = "design:brand-guideline-entry";

type SupabaseDb = SupabaseClient<Database>;

function extractTitle(markdown: string, fallback: string): string {
  const firstH1 = markdown.match(/^#\s+(.+?)\s*$/m);
  if (firstH1?.[1]) return firstH1[1].trim().slice(0, 120);
  return fallback.slice(0, 120);
}

const emitter: WritebackEmitter = {
  templateId: TEMPLATE_ID,
  async emit(ctx, supabase: SupabaseDb) {
    const entry = blocksToMarkdown(ctx.outputBlocks);
    const topic = (ctx.inputs.topic ?? "").trim() || "(unspecified topic)";
    const context = (ctx.inputs.context ?? "").trim();
    const now = new Date().toISOString();

    const auditTitle = `Brand guideline draft: ${topic}`;
    const auditContent = [
      `# ${auditTitle}`,
      ``,
      `**Topic:** ${topic}`,
      context ? `**Why now:** ${context}` : "",
      `**Source run:** ${ctx.runId}`,
      `**Accepted at:** ${now}`,
      ``,
      `## Entry (accepted)`,
      ``,
      entry,
    ]
      .filter(Boolean)
      .join("\n");
    const artifact = await insertAuditArtifact(supabase, ctx, {
      title: auditTitle,
      content: auditContent,
      summary: `Brand guideline entry on: ${topic}`,
    });

    const proposals: FiledProposal[] = [];
    const entryTitle = extractTitle(entry, topic);
    const slug = slugify(topic);
    const propId = proposalId("brand-guideline", slug);
    const targetFile = `memory/design/guidelines/${slug}.md`;
    const body = [
      entry,
      ``,
      `---`,
      `_Filed by Designer Studio (run \`${ctx.runId}\`) on ${now.slice(0, 10)}._`,
      `_Accepting this proposal writes a \`decision\` memory_file under \`${targetFile}\`. Edit the entry before accepting if the guideline needs revision._`,
    ].join("\n");

    const { error } = await supabase.from("queue_items").insert({
      tenant_id: ctx.tenantId,
      proposal_id: propId,
      status: "pending",
      body,
      frontmatter: {
        proposed_by: ctx.userActor,
        proposed_at: now,
        target_layer: "manager",
        target_file: targetFile,
        change_kind: "add",
        diff_summary: `Add brand guideline: ${entryTitle}`,
        source: `studio:${TEMPLATE_ID}`,
        source_run_id: ctx.runId,
        memory_type: "decision",
        cited_memory_ids: ctx.citedMemoryIds,
      },
    });
    if (!error) {
      proposals.push({
        proposal_id: propId,
        target_file: targetFile,
        diff_summary: `Add brand guideline: ${entryTitle}`,
      });
    }

    return { proposals, artifacts: artifact ? [artifact] : [] };
  },
};

registerWritebackEmitter(emitter);
export default emitter;
