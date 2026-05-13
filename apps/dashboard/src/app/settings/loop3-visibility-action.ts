"use server";

import { revalidatePath } from "next/cache";
import { requireActor, requireRole } from "@/lib/auth/require-user";
import { getSupabaseServerClient } from "@/lib/supabase/server";

// Task 0g of v1.5 launch polish. Per-tenant Loop-3 visibility toggle.
// Only admins may flip the flag; operators can resolve recommendations
// but cannot change tenant policy.
//
// The downstream UI lands later in the v1.5 plan; this server action is
// ready to wire into the /settings page when that task arrives.

type Visibility = "admin_only" | "everyone";
type Result = { ok: true } | { ok: false; error: string };

export async function updateLoop3Visibility(formData: FormData): Promise<Result> {
  const a = await requireActor();
  if (!a.ok) return { ok: false, error: a.output };
  const r = requireRole(a.actor, "admin");
  if (!r.ok) return { ok: false, error: r.output };

  const raw = formData.get("visibility");
  if (raw !== "admin_only" && raw !== "everyone") {
    return { ok: false, error: "visibility must be 'admin_only' or 'everyone'" };
  }
  const visibility: Visibility = raw;

  const supabase = await getSupabaseServerClient();
  const { error } = await supabase
    .from("tenants")
    .update({ loop3_teammate_visibility: visibility })
    .eq("id", a.actor.tenant_id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/settings");
  revalidatePath("/library");
  return { ok: true };
}
