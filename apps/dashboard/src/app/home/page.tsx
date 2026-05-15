import { redirect } from "next/navigation";
import { requireActor } from "@/lib/auth/require-user";
import ChatHome from "@/components/chat-home/ChatHome";
import { readRecentRuns } from "@/lib/studio/read-recent-runs";
import { readHasProviderKey } from "@/lib/bindings/read-has-provider-key";

export const dynamic = "force-dynamic";

export const metadata = { title: "Home · BBC" };

/**
 * Chat-home for member/operator/admin. Renders ChatHome (conversational
 * routing) with the tenant's recent cross-studio runs and provider-key
 * status. Viewer is redirected to /brain as defense in depth (root '/'
 * already routes them there).
 *
 * Admin's at-a-glance widgets (brain health, queue, loop3, team activity)
 * moved to /dashboard in Phase 3.
 */
export default async function HomePage() {
  const a = await requireActor();
  if (!a.ok) redirect("/auth/signin?callbackUrl=/home");
  if (a.actor.role === "viewer") redirect("/brain");

  const role = a.actor.role as "member" | "operator" | "admin";
  const [recentRuns, hasProviderKey] = await Promise.all([
    readRecentRuns(a.actor.tenant_id, { limit: 5 }),
    readHasProviderKey(a.actor.tenant_id),
  ]);

  return (
    <ChatHome
      role={role}
      hasProviderKey={hasProviderKey}
      recentRuns={recentRuns}
    />
  );
}
