"use server";

import { revalidatePath } from "next/cache";
import { requireActor, requireRole } from "@/lib/auth/require-user";
import { adminClient } from "@/lib/api-auth";
import { isHostedDemoMode } from "@/lib/secrets/tenant-keys";

/**
 * D-W7-3: hosted-demo "reset to fixture" button.
 *
 * Calls public.reset_demo_tenant(uuid) — wipes the demo tenant and re-seeds
 * the 58-row fixture in one call. The SQL function is revoked from
 * authenticated/anon (defined in supabase/seed/demo-tenant.sql); we invoke
 * it through the service-role adminClient.
 *
 * Gating:
 *   - requireActor + requireRole(admin). Members can't reset.
 *   - isHostedDemoMode() gate. On self-host (BBC_HOSTED_DEMO_MODE != true)
 *     the action refuses, even for admins — there's no demo tenant to reset.
 *
 * On success, every tenant_members + memory_files row in the demo tenant
 * is replaced, and the caller's profile is repointed at the new tenant_id
 * (the SQL function handles the profile snapshot/restore). Re-revalidate
 * the routes that read tenant state.
 */
export type ResetDemoResult =
  | { ok: true; newTenantId: string }
  | { ok: false; error: string };

export async function resetDemoTenant(): Promise<ResetDemoResult> {
  if (!isHostedDemoMode()) {
    return { ok: false, error: "reset_demo_tenant is only available on the hosted demo" };
  }

  const a = await requireActor();
  if (!a.ok) return { ok: false, error: a.output };
  const r = requireRole(a.actor, "admin");
  if (!r.ok) return { ok: false, error: r.output };

  const supabase = adminClient();
  const { data, error } = await supabase.rpc("reset_demo_tenant", {
    p_owner_user_id: a.actor.user_id,
  });

  if (error) {
    return { ok: false, error: `reset failed: ${error.message}` };
  }
  if (typeof data !== "string") {
    return { ok: false, error: "reset failed: rpc returned no tenant id" };
  }

  revalidatePath("/settings");
  revalidatePath("/library");
  revalidatePath("/memory");
  revalidatePath("/queue");

  return { ok: true, newTenantId: data };
}
