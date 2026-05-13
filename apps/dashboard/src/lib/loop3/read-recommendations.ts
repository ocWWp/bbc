// v1.5 D-W4-4: server-side reader for the Library "Recommended for you" band.
//
// Returns one row per pending recommendation, narrowed to the caller's
// tenant via RLS. The UI joins each row to its catalog entry (skill /
// connector / provider) client-side using the data arrays it already has.

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export type PendingRec = {
  /** recommendations.id (uuid) — used by the dismiss/install actions. */
  id: string;
  target_kind: "skill" | "connector" | "provider";
  /** Catalog id — sk_001 for skills, framework id for connectors, pr_*
   *  for providers. Matched against the static catalogs in _data.ts. */
  target_id: string;
  reason_code: string;
  reason_human: string;
  recommended_at: string;
};

export async function readPendingRecommendations(
  supabase: SupabaseClient,
): Promise<PendingRec[]> {
  const { data, error } = await supabase
    .from("recommendations")
    .select("id, target_kind, target_id, reason_code, reason_human, recommended_at")
    .eq("state", "pending")
    .order("recommended_at", { ascending: false });
  if (error || !data) return [];
  // Defensive: the table CHECK already constrains target_kind, but a stray
  // value from a manual insert shouldn't crash the page.
  return (data as RawRow[]).filter(isKnownKind).map((r) => ({
    id: r.id,
    target_kind: r.target_kind,
    target_id: r.target_id,
    reason_code: r.reason_code,
    reason_human: r.reason_human,
    recommended_at: r.recommended_at,
  }));
}

type RawRow = {
  id: string;
  target_kind: string;
  target_id: string;
  reason_code: string;
  reason_human: string;
  recommended_at: string;
};

function isKnownKind(
  r: RawRow,
): r is RawRow & { target_kind: PendingRec["target_kind"] } {
  return r.target_kind === "skill" || r.target_kind === "connector" || r.target_kind === "provider";
}
