import type { Metadata } from "next";
import { requireActor } from "@/lib/auth/require-user";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { readTenantSkills } from "@/lib/skills/read-tenant-skills";
import { readTenantConnectors } from "@/lib/connectors/read-tenant-connectors";
import { readPendingRecommendations } from "@/lib/loop3/read-recommendations";
import { triggerLibraryVisitGenerate } from "@/lib/loop3/generate";
import { CONNECTORS, mergeConnectorState } from "./_data";
import { LibraryClient } from "./_components/LibraryClient";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Library · BBC" };

// Visual port of the Claude Design /library surface.
//   - Skills: static catalog + tenant_skills (W2-7 / readTenantSkills).
//   - Connectors: static catalog overlaid with tenant_connectors install state
//     (W3-6 / readTenantConnectors) — installed cards surface status badge
//     + last_sync_at.
//   - Recommendations: pending rows from W4-3 lifecycle (W4-4 wiring); the
//     visit trigger (W4-5) fires-and-forgets a regenerate on every visit
//     (1-hour TTL).
//   - Providers: still on _data.ts mocks; live wiring lands later.
export default async function LibraryPage() {
  const actor = await requireActor();
  const supabase = await getSupabaseServerClient();
  const [importedSkills, installedConnectors, recommendations] = await Promise.all([
    readTenantSkills(supabase),
    readTenantConnectors(supabase),
    readPendingRecommendations(supabase),
  ]);
  const catalogConnectors = mergeConnectorState(CONNECTORS, installedConnectors);

  // Fire-and-forget visit trigger. Try to hand the promise to Cloudflare's
  // ctx.waitUntil() so the worker keeps running past the response flush;
  // outside Workers (next dev, tests) we fall back to `void` so the
  // microtask still kicks off in the local Node event loop. The TTL guard
  // inside triggerLibraryVisitGenerate keeps this from running every request.
  if (actor.ok) {
    const tenant_id = actor.actor.tenant_id;
    try {
      const { getCloudflareContext } = await import("@opennextjs/cloudflare");
      const cf = await getCloudflareContext({ async: true });
      cf.ctx.waitUntil(triggerLibraryVisitGenerate(tenant_id));
    } catch {
      void triggerLibraryVisitGenerate(tenant_id);
    }
  }

  return (
    <LibraryClient
      importedSkills={importedSkills}
      catalogConnectors={catalogConnectors}
      recommendations={recommendations}
    />
  );
}
