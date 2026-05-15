// Cross-studio recent runs for the /home chat-home (and previously the
// retired /studio index, now /gallery footer). Single source of truth so
// /home and /gallery don't drift in column shape or ordering.

import "server-only";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { RecentRun } from "@/components/chat-home/RecentRunsStrip";

export async function readRecentRuns(
  tenantId: string,
  opts: { limit?: number } = {},
): Promise<RecentRun[]> {
  const limit = opts.limit ?? 5;
  const supabase = await getSupabaseServerClient();
  const { data } = await supabase
    .from("studio_runs")
    .select("id, template_id, task, status, created_at")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as RecentRun[];
}
