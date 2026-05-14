// v1.5 D-W4-5: server-side helpers for the /library visit trigger.
//
// Kept out of "use server" actions.ts so non-RPC callers can import these
// directly without paying the action overhead. The trigger lives in an
// isolate-local Map keyed by tenant — 1-hour TTL is the spec.

import "server-only";

import { adminClient } from "@/lib/api-auth";
import { generateRecommendations, type GenerateResult } from "./lifecycle";
import { makeSupabaseLifecycleDb } from "./lifecycle-supabase";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VISIT_TTL_MS = 60 * 60 * 1000;

/** Module-local last-run timestamps. In Cloudflare Workers this persists
 *  across requests within an isolate (until eviction) — coarse but exactly
 *  the granularity needed to keep one hot tenant from generating recs on
 *  every visit. Cold isolates just kick off a fresh generate; the lifecycle
 *  is idempotent. */
const lastVisitGenerate = new Map<string, number>();

/** Service-role wrapper. Safe to call without an auth context because
 *  tenant_id is passed explicitly and INSERTs into recommendations have no
 *  member-level RLS policy. */
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
        dropped_snoozed: 0,
        pending_before: 0,
      },
    };
  }
  const supabase = adminClient();
  const db = makeSupabaseLifecycleDb(supabase);
  return generateRecommendations(tenant_id, db);
}

/** Fire-and-forget visit trigger. Returns the promise the page should hand
 *  to ctx.waitUntil() in Cloudflare; safe to just `void` in dev/node.
 *  Returns false from the promise when the TTL skipped the run. */
export async function triggerLibraryVisitGenerate(tenant_id: string): Promise<boolean> {
  if (!UUID_RE.test(tenant_id)) return false;
  const now = Date.now();
  const prev = lastVisitGenerate.get(tenant_id);
  if (prev != null && now - prev < VISIT_TTL_MS) return false;
  // Stamp BEFORE the await so a concurrent request inside the same isolate
  // doesn't double-fire while the first generate is still in flight.
  lastVisitGenerate.set(tenant_id, now);
  try {
    await generateRecommendationsForTenant(tenant_id);
    return true;
  } catch {
    // Best-effort: roll back the stamp so the next visit retries.
    lastVisitGenerate.delete(tenant_id);
    return false;
  }
}

/** Test-only reset of the TTL map. Not exported to non-test callers. */
export function __resetVisitTriggerForTests(): void {
  lastVisitGenerate.clear();
}
