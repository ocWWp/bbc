import "server-only";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export type QueueSummaryItem = {
  id: string; // queue_items.id (uuid)
  proposal_id: string; // queue_items.proposal_id (text slug)
  change_kind: string;
  summary: string;
  target_file: string;
  created_at: string;
};

export type QueueSummary = {
  pendingCount: number;
  topPending: QueueSummaryItem[];
};

/**
 * Top 3 pending queue items + the total pending count. Powers the
 * QueueSummary card on /home. Proposal metadata lives in the jsonb
 * `frontmatter` column (Task 0d); we surface change_kind, diff_summary,
 * and target_file from there.
 */
export async function readQueueSummary(tenantId: string): Promise<QueueSummary> {
  const supabase = await getSupabaseServerClient();
  const { data, count } = await supabase
    .from("queue_items")
    .select("id, proposal_id, frontmatter, created_at", { count: "exact" })
    .eq("tenant_id", tenantId)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(3);

  type Row = {
    id: string;
    proposal_id: string;
    frontmatter: Record<string, unknown> | null;
    created_at: string;
  };
  const rows = (data ?? []) as Row[];

  const topPending: QueueSummaryItem[] = rows.map((r) => {
    const fm = r.frontmatter ?? {};
    const get = (k: string, fallback = "") => {
      const v = (fm as Record<string, unknown>)[k];
      return typeof v === "string" ? v : fallback;
    };
    return {
      id: r.id,
      proposal_id: r.proposal_id,
      change_kind: get("change_kind", "edit"),
      summary: get("diff_summary"),
      target_file: get("target_file"),
      created_at: r.created_at,
    };
  });

  return {
    pendingCount: count ?? 0,
    topPending,
  };
}
