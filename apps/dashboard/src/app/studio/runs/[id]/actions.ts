"use server";

import { revalidatePath } from "next/cache";
import { requireActor, requireRole } from "@/lib/auth/require-user";
import { getSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Generic accept/reject for any Studio run regardless of which studio created
 * it. Marketing has its own copy that revalidates /studio/marketing; this one
 * revalidates the unified viewer + the index. Both use the same RLS-gated
 * ownership check (tenant + created_by).
 */

const RUN_ID_RE = /^[0-9a-fA-F-]{36}$/;

export type ReviewResult = { ok: true } | { ok: false; error: string };

export async function acceptRun(runId: string): Promise<ReviewResult> {
  const a = await requireActor();
  if (!a.ok) return { ok: false, error: a.output };
  const r = requireRole(a.actor, "member");
  if (!r.ok) return { ok: false, error: r.output };
  if (!RUN_ID_RE.test(runId)) return { ok: false, error: "Invalid run id." };

  const supabase = await getSupabaseServerClient();
  const { error } = await supabase
    .from("studio_runs")
    .update({ status: "accepted", completed_at: new Date().toISOString() })
    .eq("id", runId)
    .eq("tenant_id", a.actor.tenant_id)
    .eq("created_by", a.actor.user_id);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/studio/runs/${runId}`);
  revalidatePath("/studio");
  return { ok: true };
}

export async function rejectRun(runId: string): Promise<ReviewResult> {
  const a = await requireActor();
  if (!a.ok) return { ok: false, error: a.output };
  const r = requireRole(a.actor, "member");
  if (!r.ok) return { ok: false, error: r.output };
  if (!RUN_ID_RE.test(runId)) return { ok: false, error: "Invalid run id." };

  const supabase = await getSupabaseServerClient();
  const { error } = await supabase
    .from("studio_runs")
    .update({ status: "rejected", completed_at: new Date().toISOString() })
    .eq("id", runId)
    .eq("tenant_id", a.actor.tenant_id)
    .eq("created_by", a.actor.user_id);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/studio/runs/${runId}`);
  revalidatePath("/studio");
  return { ok: true };
}
