"use server";

import { revalidatePath } from "next/cache";
import { requireActor } from "@/lib/auth/require-user";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/api-auth";
import { makeSupabaseLifecycleDb } from "./lifecycle-supabase";
import {
  dismissRecommendation,
  generateRecommendations,
  installRecommendation,
  snoozeRecommendation,
  type GenerateResult,
} from "./lifecycle";

// ---------------------------------------------------------------------------
// Server actions for the Library /recommendations band.
//
// Auth + tenant scoping:
//   - All state-changing actions go through requireActor(); RLS on the
//     recommendations table further constrains UPDATEs to the caller's tenant.
//   - generateRecommendationsForTenant() uses the service-role client because
//     INSERTs have no member-level RLS policy (recommender runs without
//     auth.uid()) and the call site is a fire-and-forget /library visit
//     trigger (W4-5) rather than an authenticated form submit.
// ---------------------------------------------------------------------------

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type ActionResult = { ok: true } | { ok: false; error: string };

function validateId(id: unknown): { ok: true; id: string } | { ok: false; error: string } {
  if (typeof id !== "string" || !UUID_RE.test(id)) {
    return { ok: false, error: "Invalid recommendation id." };
  }
  return { ok: true, id };
}

export async function dismissRecommendationAction(formData: FormData): Promise<ActionResult> {
  const a = await requireActor();
  if (!a.ok) return { ok: false, error: a.output };

  const v = validateId(formData.get("id"));
  if (!v.ok) return v;

  const supabase = await getSupabaseServerClient();
  const db = makeSupabaseLifecycleDb(supabase);
  const result = await dismissRecommendation(v.id, db);
  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath("/library");
  return { ok: true };
}

export async function snoozeRecommendationAction(formData: FormData): Promise<ActionResult> {
  const a = await requireActor();
  if (!a.ok) return { ok: false, error: a.output };

  const v = validateId(formData.get("id"));
  if (!v.ok) return v;

  const hoursRaw = formData.get("hours");
  const hours = typeof hoursRaw === "string" ? Number(hoursRaw) : 24;
  if (!Number.isFinite(hours) || hours <= 0 || hours > 24 * 90) {
    return { ok: false, error: "Snooze must be between 1 hour and 90 days." };
  }
  const until = new Date(Date.now() + hours * 60 * 60 * 1000);

  const supabase = await getSupabaseServerClient();
  const db = makeSupabaseLifecycleDb(supabase);
  const result = await snoozeRecommendation(v.id, until, db);
  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath("/library");
  return { ok: true };
}

/** Marks a recommendation as installed. Called by the rec card after the
 *  user completes the upstream install (skill import, connector OAuth,
 *  provider connect). The lifecycle does NOT itself drive the install —
 *  the UI uses the existing per-target install paths and reports back. */
export async function markRecommendationInstalledAction(
  formData: FormData,
): Promise<ActionResult> {
  const a = await requireActor();
  if (!a.ok) return { ok: false, error: a.output };

  const v = validateId(formData.get("id"));
  if (!v.ok) return v;

  const supabase = await getSupabaseServerClient();
  const db = makeSupabaseLifecycleDb(supabase);
  const result = await installRecommendation(v.id, db);
  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath("/library");
  return { ok: true };
}

/** Service-role wrapper used by the /library visit trigger (W4-5). Safe to
 *  call without an auth context because tenant_id is passed explicitly and
 *  RLS is bypassed (INSERT into recommendations has no member-level policy).
 *  Returns the GenerateResult so callers can log diagnostics. */
export async function generateRecommendationsForTenant(
  tenant_id: string,
): Promise<GenerateResult> {
  if (!UUID_RE.test(tenant_id)) {
    return {
      inserted: 0,
      reason: "all_filtered",
      diagnostics: {
        candidates: 0,
        dropped_existing_pending: 0,
        dropped_cooldown: 0,
        pending_before: 0,
      },
    };
  }
  const supabase = adminClient();
  const db = makeSupabaseLifecycleDb(supabase);
  return generateRecommendations(tenant_id, db);
}
