"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireActor, requireRole } from "@/lib/auth/require-user";
import { getSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Server action behind /settings/quotas. Writes the four override columns
 * via the set_quota_caps RPC (migration 0053), which audits the change to
 * operations_log. Admin only.
 *
 * Each cap field comes in as a string from the form:
 *   ""        — leave override unset (use default)
 *   "12345"   — set override to 12345
 *
 * On error: redirect with ?error=<msg>; on success: revalidatePath +
 * redirect with ?ok=updated.
 */

function bounce(qs: Record<string, string>): never {
  const params = new URLSearchParams(qs);
  redirect(`/settings/quotas?${params.toString()}`);
}

const FIELDS = [
  { key: "max_tokens", max: 100_000_000, label: "tokens/day" },
  { key: "max_turns", max: 100_000, label: "turns/day" },
  { key: "max_runs", max: 24_000, label: "runs/day" },
  { key: "max_signals", max: 1_000, label: "active signals" },
] as const;

function parseField(raw: string, max: number, label: string): number | null {
  const t = raw.trim();
  if (t === "") return null;
  if (!/^\d+$/.test(t)) {
    bounce({ error: `${label}: must be a positive integer or empty` });
  }
  const n = Number.parseInt(t, 10);
  if (!Number.isFinite(n) || n <= 0) {
    bounce({ error: `${label}: must be > 0 or empty` });
  }
  if (n > max) {
    bounce({ error: `${label}: must be <= ${max.toLocaleString()}` });
  }
  return n;
}

export async function updateQuotaCaps(formData: FormData): Promise<void> {
  const a = await requireActor();
  if (!a.ok) bounce({ error: a.output });
  const r = requireRole(a.actor, "admin");
  if (!r.ok) bounce({ error: r.output });

  const values: Record<string, number | null> = {};
  for (const f of FIELDS) {
    values[f.key] = parseField(String(formData.get(f.key) ?? ""), f.max, f.label);
  }

  const sb = await getSupabaseServerClient();
  const { error } = await sb.rpc("set_quota_caps", {
    p_max_tokens: values.max_tokens,
    p_max_turns: values.max_turns,
    p_max_runs: values.max_runs,
    p_max_signals: values.max_signals,
  });
  if (error) bounce({ error: error.message });

  revalidatePath("/settings/quotas");
  revalidatePath("/settings/log");
  bounce({ ok: "updated" });
}
