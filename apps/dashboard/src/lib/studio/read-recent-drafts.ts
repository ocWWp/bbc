import "server-only";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { requireActor } from "@/lib/auth/require-user";
import { templateIdsForRole, type StudioRole } from "./template-id";

export type RecentDraft = {
  id: string;
  title: string;
  templateSlug: string;
  status: string;
  createdAt: string | null;
};

type BlockNoteLike =
  | { content?: unknown; children?: unknown[]; text?: string; type?: string }
  | string
  | null
  | undefined;

/**
 * Best-effort title extractor from a studio_runs.output_blocks JSON value.
 * studio output blocks share the BlockNote-ish shape used in memory_files
 * — a top-level array of blocks, each with `content` (an array of inline
 * runs each of which has `text`). The first non-empty run wins, capped
 * at 80 chars. Falls back to null when nothing usable is in the blocks.
 */
function extractTitleFromOutputBlocks(value: unknown): string | null {
  if (!Array.isArray(value)) return null;
  for (const raw of value as BlockNoteLike[]) {
    if (!raw || typeof raw === "string") continue;
    const inlineRuns = Array.isArray(raw.content) ? raw.content : [];
    for (const run of inlineRuns as BlockNoteLike[]) {
      if (run && typeof run !== "string" && typeof run.text === "string") {
        const t = run.text.trim();
        if (t.length > 0) return t.length > 80 ? `${t.slice(0, 80)}…` : t;
      }
    }
  }
  return null;
}

export { extractTitleFromOutputBlocks };

/**
 * Task 20: read the N most-recent studio runs for the actor's tenant,
 * filtered to the given role's templates. RLS already enforces tenant
 * scoping; the role filter is a `LIKE` on the prefix from templateIdsForRole.
 */
export async function readRecentDrafts(role: StudioRole, limit = 10): Promise<RecentDraft[]> {
  const a = await requireActor();
  if (!a.ok) return [];

  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from("studio_runs")
    .select("id, template_id, status, output_blocks, created_at")
    .eq("tenant_id", a.actor.tenant_id)
    .like("template_id", templateIdsForRole(role))
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) return [];

  return (data ?? []).map((r) => {
    const row = r as {
      id: string;
      template_id: string;
      status: string;
      output_blocks: unknown;
      created_at: string | null;
    };
    return {
      id: row.id,
      title: extractTitleFromOutputBlocks(row.output_blocks) ?? `${row.template_id} draft`,
      templateSlug: row.template_id,
      status: row.status,
      createdAt: row.created_at,
    };
  });
}
