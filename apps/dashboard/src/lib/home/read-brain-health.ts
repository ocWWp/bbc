import "server-only";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { SUPERTAGS, type Supertag } from "@/lib/memory/types";

export type BrainHealth = {
  totalMemories: number;
  byType: Record<Supertag, number>;
  awaitingReview: number;
  lastSeedAt: string | null;
};

const emptyByType = (): Record<Supertag, number> =>
  SUPERTAGS.reduce((acc, t) => {
    acc[t] = 0;
    return acc;
  }, {} as Record<Supertag, number>);

/**
 * Reads a coarse health summary of the tenant's brain. Drives the BrainHealth
 * card on /home: "47 memories · 3 awaiting review · last seed 4d ago".
 *
 * All reads RLS-gated to the tenant. Caller passes tenantId from the actor.
 */
export async function readBrainHealth(tenantId: string): Promise<BrainHealth> {
  const supabase = await getSupabaseServerClient();

  const [rowsResult, awaitingResult] = await Promise.all([
    supabase
      .from("memory_files")
      .select("type, status, created_at")
      .eq("tenant_id", tenantId)
      .in("status", ["draft", "active"]),
    supabase
      .from("queue_items")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("status", "pending"),
  ]);

  type Row = { type: Supertag; status: string; created_at: string | null };
  const rows = (rowsResult.data ?? []) as Row[];

  const byType = emptyByType();
  for (const r of rows) {
    if (r.type in byType) byType[r.type] += 1;
  }

  let lastSeedAt: string | null = null;
  for (const r of rows) {
    if (!r.created_at) continue;
    if (lastSeedAt === null || r.created_at > lastSeedAt) {
      lastSeedAt = r.created_at;
    }
  }

  return {
    totalMemories: rows.length,
    byType,
    awaitingReview: awaitingResult.count ?? 0,
    lastSeedAt,
  };
}
