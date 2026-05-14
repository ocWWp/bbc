// Writeback emitter contract. When a studio run is accepted, the run's
// template_id is looked up in the registry; if an emitter is registered,
// it runs and produces queue_items proposals (and optionally direct
// memory_files inserts for source_artifact audit rows).
//
// Why proposals, not direct memory_files writes? CLAUDE.md principle #6
// ("no silent autonomy"): every state change is either a human edit at
// the owning layer, or a queued proposal that passes through accept.
// source_artifact rows ARE direct inserts because they're audit history,
// not facts about the brain -- the audit trail is non-negotiable.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { OutputBlock } from "@/lib/studio/output-blocks";

type SupabaseDb = SupabaseClient<Database>;

export type WritebackContext = {
  runId: string;
  templateId: string;
  task: string;
  inputs: Record<string, string>;
  outputBlocks: OutputBlock[];
  citedMemoryIds: string[];
  tenantId: string;
  userId: string;
  userActor: string; // "human:<email>" form used in queue frontmatter
};

export type FiledProposal = {
  proposal_id: string;
  target_file: string;
  diff_summary: string;
};

export type FiledArtifact = {
  memory_id: string;
  type: string;
  title: string;
};

export type WritebackResult = {
  proposals: FiledProposal[];
  artifacts: FiledArtifact[];
};

export type WritebackEmitter = {
  templateId: string;
  emit(
    ctx: WritebackContext,
    supabase: SupabaseClient<Database>,
  ): Promise<WritebackResult>;
};

// Helpers ------------------------------------------------------------------

const SLUG_RE = /[^a-z0-9]+/g;

export function slugify(s: string, max = 60): string {
  const base = s.toLowerCase().replace(SLUG_RE, "-").replace(/^-+|-+$/g, "");
  return base.slice(0, max) || "untitled";
}

export function proposalId(prefix: string, slug: string): string {
  // Match the proposal_id pattern used elsewhere in BBC:
  // prop_<YYYYMMDD>_<slug>. Adding a short random suffix prevents collisions
  // when the same template fires multiple times in a single day.
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const rand = Math.random().toString(36).slice(2, 6);
  return `prop_${date}_${prefix}_${slugify(slug, 40)}_${rand}`;
}

export function blocksToMarkdown(blocks: OutputBlock[]): string {
  return blocks
    .map((b) => {
      if (b.kind === "plain") return b.props.text;
      if (b.kind === "doc") {
        const secs = b.props.sections?.length
          ? "\n\n" +
            b.props.sections
              .map((s) => `## ${s.heading}\n\n${s.body_markdown}`)
              .join("\n\n")
          : "";
        return `# ${b.props.title}\n\n_${b.props.doc_type}_\n\n${b.props.body_markdown}${secs}`;
      }
      return JSON.stringify(b);
    })
    .join("\n\n");
}

// Shared audit-row insert. Every support-template writeback writes one of
// these "what happened" rows to memory_files (type=source_artifact) so the
// founder can search/replay past runs. Returns FiledArtifact on success or
// null on insert error -- emitters surface the error in their own return
// shape (artifacts list stays empty).
export async function insertAuditArtifact(
  supabase: SupabaseDb,
  ctx: WritebackContext,
  args: {
    title: string;
    content: string;
    summary: string;
    pathPrefix?: string;
  },
): Promise<FiledArtifact | null> {
  const path = `${args.pathPrefix ?? "studio-runs"}/${ctx.runId}.md`;
  const { data, error } = await supabase
    .from("memory_files")
    .insert({
      tenant_id: ctx.tenantId,
      type: "source_artifact" as Database["public"]["Enums"]["memory_type"],
      title: args.title.slice(0, 200),
      content: args.content.slice(0, 50_000),
      fields: {
        source_kind: "text",
        summary: args.summary.slice(0, 2000),
      } as Database["public"]["Tables"]["memory_files"]["Insert"]["fields"],
      status: "active" as Database["public"]["Enums"]["memory_status"],
      path,
    })
    .select("id")
    .single();
  if (error || !data) return null;
  return {
    memory_id: (data as { id: string }).id,
    type: "source_artifact",
    title: args.title,
  };
}
