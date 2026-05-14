"use server";

import { revalidatePath } from "next/cache";
import { requireActor } from "@/lib/auth/require-user";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export type MarkReadResult =
  | { ok: true }
  | { ok: false; code: "unauthorized" | "invalid_input" | "not_found" | "db_error"; error?: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Marks a single inbox row as read. RLS enforces ownership; the
 * inbox_items_only_read_at_changes trigger enforces that no other
 * field can be modified by the owner.
 */
export async function markInboxItemRead(formData: FormData): Promise<MarkReadResult> {
  const a = await requireActor();
  if (!a.ok) return { ok: false, code: "unauthorized" };

  const id = String(formData.get("id") ?? "").trim();
  if (!UUID_RE.test(id)) return { ok: false, code: "invalid_input" };

  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from("inbox_items")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", a.actor.user_id)
    .eq("tenant_id", a.actor.tenant_id)
    .select("id")
    .maybeSingle();

  if (error) return { ok: false, code: "db_error", error: error.message };
  if (!data) return { ok: false, code: "not_found" };

  revalidatePath("/inbox");
  return { ok: true };
}
