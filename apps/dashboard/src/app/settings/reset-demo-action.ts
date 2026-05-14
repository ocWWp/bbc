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
 * Gating (must pass ALL):
 *   1. isHostedDemoMode() — on self-host the demo tenant doesn't exist.
 *   2. requireActor + requireRole(admin) — members can't reset.
 *   3. Caller's tenant_slug === DEMO_TENANT_SLUG. **Codex [P1]:** without
 *      this, any tenant admin on the hosted demo could call this action and
 *      (a) wipe the shared demo out from under other users, (b) get
 *      themselves repointed into the freshly-seeded demo tenant as admin.
 *      The RPC ignores the caller's current tenant_id — it always targets
 *      `slug='demo-acme'` — so the safety gate has to live here.
 *
 * On success, every tenant_members + memory_files row in the demo tenant
 * is replaced, and the caller's profile is repointed at the new tenant_id
 * (the SQL function handles the profile snapshot/restore). Re-revalidate
 * the routes that read tenant state.
 */
const DEMO_TENANT_SLUG = "demo-acme";

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
  if (a.actor.tenant_slug !== DEMO_TENANT_SLUG) {
    return { ok: false, error: "reset_demo_tenant can only be called from the demo tenant" };
  }

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
