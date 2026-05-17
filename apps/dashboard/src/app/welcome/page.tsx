import { redirect } from "next/navigation";
import { requireActor } from "@/lib/auth/require-user";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { hasTenantProviderKey, isHostedDemoMode } from "@/lib/secrets/tenant-keys";
import { Onboarding } from "./Onboarding";

export const metadata = { title: "Welcome — BBC" };
export const dynamic = "force-dynamic";

type SearchParams = Promise<{ preview?: string }>;

export default async function WelcomePage({ searchParams }: { searchParams: SearchParams }) {
  const { preview } = await searchParams;

  // Dev-only preview mode: renders the onboarding chrome with mock proposals
  // so the magic UI is visible without auth + DB setup. ?preview=1 in dev.
  if (preview === "1" && process.env.NODE_ENV !== "production") {
    return <Onboarding tenantSlug="preview-tenant" previewMode />;
  }

  const a = await requireActor();
  if (!a.ok) redirect("/auth/signin?callbackUrl=/welcome");

  const supabase = await getSupabaseServerClient();

  // Pre-launch audit fix: /welcome is the one carve-out from Main CLAUDE.md
  // principle #6 (every memory write goes through the queue). The carve-out
  // is meant for the workspace OWNER's first dump only — teammates joining
  // an already-set-up workspace should not see /welcome at all (and
  // definitely shouldn't be able to bulk-insert into shared memory).
  //
  // Heuristic: if the tenant already has any memory rows, the workspace is
  // already set up. Skip /welcome and send the user to /home. They can
  // introduce themselves via chat — which DOES go through normal queue
  // rules, exactly the right threat model for a teammate.
  const { count: existingMemoryCount } = await supabase
    .from("memory_files")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", a.actor.tenant_id);
  if ((existingMemoryCount ?? 0) > 0) {
    redirect("/home");
  }

  const hasAnthropicKey = await hasTenantProviderKey(
    supabase,
    a.actor.tenant_id,
    "anthropic",
  );

  return (
    <Onboarding
      tenantSlug={a.actor.tenant_slug}
      byokState={{
        hasAnthropicKey,
        isHostedDemo: isHostedDemoMode(),
      }}
    />
  );
}
