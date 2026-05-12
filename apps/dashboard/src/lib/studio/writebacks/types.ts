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
      return JSON.stringify(b);
    })
    .join("\n\n");
}
