import type { Metadata } from "next";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { readTenantSkills } from "@/lib/skills/read-tenant-skills";
import { readTenantConnectors } from "@/lib/connectors/read-tenant-connectors";
import { CONNECTORS, mergeConnectorState } from "./_data";
import { LibraryClient } from "./_components/LibraryClient";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Library · BBC" };

// Visual port of the Claude Design /library surface.
//   - Skills: static catalog + tenant_skills (W2-7 / readTenantSkills).
//   - Connectors: static catalog overlaid with tenant_connectors install state
//     (W3-6 / readTenantConnectors) — installed cards surface status badge
//     + last_sync_at.
//   - Providers: still on _data.ts mocks; live wiring lands later.
export default async function LibraryPage() {
  const supabase = await getSupabaseServerClient();
  const [importedSkills, installedConnectors] = await Promise.all([
    readTenantSkills(supabase),
    readTenantConnectors(supabase),
  ]);
  const catalogConnectors = mergeConnectorState(CONNECTORS, installedConnectors);
  return <LibraryClient importedSkills={importedSkills} catalogConnectors={catalogConnectors} />;
}
