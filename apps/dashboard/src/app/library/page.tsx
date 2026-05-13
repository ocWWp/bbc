import type { Metadata } from "next";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { readTenantSkills } from "@/lib/skills/read-tenant-skills";
import { LibraryClient } from "./_components/LibraryClient";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Library · BBC" };

// Visual port of the Claude Design /library surface. Static catalog cards
// live in _data.ts; user-imported skills come from tenant_skills via
// readTenantSkills() and render alongside the catalog.
//
// Connectors + Providers wire to their own real-data readers in later W2/W3
// deliverables. For now they stay on _data.ts mocks.
export default async function LibraryPage() {
  const supabase = await getSupabaseServerClient();
  const importedSkills = await readTenantSkills(supabase);
  return <LibraryClient importedSkills={importedSkills} />;
}
