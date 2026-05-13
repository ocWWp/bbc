"use server";

import { revalidatePath } from "next/cache";
import { requireActor, requireRole } from "@/lib/auth/require-user";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { makeSupabaseLifecycleDb } from "./lifecycle-supabase";
import {
  dismissRecommendation,
  installRecommendation,
  snoozeRecommendation,
} from "./lifecycle";

// ---------------------------------------------------------------------------
// Server actions for the Library /recommendations band.
//
// Auth + tenant scoping: every action goes through requireActor() +
// requireRole("operator") before touching the lifecycle. Per ADR-0012 +
// Task 0g, dismiss/snooze/install are tenant-wide install decisions; only
// operators+ may make them. Members reading via the 'everyone' visibility
// flag see suggestions but cannot resolve them. RLS on the recommendations
// table enforces the same gate at the SQL layer (recommendations_operator_
// update in 0042).
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
  const r = requireRole(a.actor, "operator");
  if (!r.ok) return { ok: false, error: r.output };

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
  const r = requireRole(a.actor, "operator");
  if (!r.ok) return { ok: false, error: r.output };

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
  const r = requireRole(a.actor, "operator");
  if (!r.ok) return { ok: false, error: r.output };

  const v = validateId(formData.get("id"));
  if (!v.ok) return v;

  const supabase = await getSupabaseServerClient();
  const db = makeSupabaseLifecycleDb(supabase);
  const result = await installRecommendation(v.id, db);
  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath("/library");
  return { ok: true };
}

