import "server-only";

import { NextRequest } from "next/server";

import { requireActor, requireRole } from "@/lib/auth/require-user";
import { findMetric } from "@/lib/integrations/posthog";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

// POST /api/observer/signals/setup
//
// Step 2 of the three-step consent flow (M4.4). Inputs a metric proposal
// from the agent's watch_proposed action card and:
//   1. Validates the metric exists in the local catalog (no PostHog call)
//   2. Resolves projectId + region (body OR env fallback)
//   3. Creates an observer_signals row with enabled=false
//   4. Returns the new signalId for the action card to advance to step 3
//
// A live PostHog ping isn't part of v1.6 setup — first Run-now does that.
// Reason: the catalog already guarantees the metric is well-formed HogQL,
// and a ping has its own auth/rate-limit failure modes that would block
// otherwise-correct setups. The user finds bad creds at the first run with
// a clear adapter_error.

type SetupBody = {
  metric?: string;
  projectId?: string;
  region?: "us" | "eu";
};

type SetupResponse =
  | { ok: true; signalId: string; metricLabel: string }
  | { ok: false; error: string };

function json(body: SetupResponse, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export async function POST(req: NextRequest) {
  const actorRes = await requireActor();
  if (!actorRes.ok) return json({ ok: false, error: "unauthorized" }, 401);
  const roleCheck = requireRole(actorRes.actor, "operator");
  if (!roleCheck.ok) return json({ ok: false, error: roleCheck.output }, 403);
  const actor = actorRes.actor;

  let body: SetupBody = {};
  try {
    body = (await req.json()) as SetupBody;
  } catch {
    return json({ ok: false, error: "invalid JSON" }, 400);
  }

  const metricId = (body.metric ?? "").trim();
  if (!metricId) return json({ ok: false, error: "metric is required" }, 400);

  const metric = findMetric(metricId);
  if (!metric) return json({ ok: false, error: `unknown metric: ${metricId}` }, 400);

  const projectId = (body.projectId ?? process.env.POSTHOG_PROJECT_ID ?? "").trim();
  const region: "us" | "eu" =
    body.region ?? ((process.env.POSTHOG_REGION as "us" | "eu") || "us");

  if (!projectId) {
    return json(
      {
        ok: false,
        error:
          "PostHog project not configured. Set POSTHOG_PROJECT_ID in env or pass projectId.",
      },
      400,
    );
  }

  // Soft guard: if a non-deleted signal already exists for the same
  // (tenant, metric, projectId), reuse it instead of creating a duplicate.
  // Avoids the "set up twice → two rows" UX wart.
  const supabase = await getSupabaseServerClient();
  const { data: existing } = await supabase
    .from("observer_signals")
    .select("id, enabled")
    .eq("tenant_id", actor.tenant_id)
    .eq("signal_type", "posthog.metric")
    .is("deleted_at", null)
    .contains("config_jsonb", { metric: metricId, projectId })
    .limit(1)
    .maybeSingle();

  if (existing?.id) {
    return json(
      { ok: true, signalId: existing.id as string, metricLabel: metric.label },
      200,
    );
  }

  const { data, error } = await supabase
    .from("observer_signals")
    .insert({
      tenant_id: actor.tenant_id,
      signal_type: "posthog.metric",
      config_jsonb: { metric: metricId, projectId, region },
      enabled: false,
      created_by: actor.user_id,
    })
    .select("id")
    .single();

  if (error || !data) {
    return json(
      { ok: false, error: error?.message ?? "could not create signal" },
      500,
    );
  }

  return json(
    { ok: true, signalId: (data as { id: string }).id, metricLabel: metric.label },
    200,
  );
}
