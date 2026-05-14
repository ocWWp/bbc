import { redirect } from "next/navigation";
import { requireActor } from "@/lib/auth/require-user";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { readBrainHealth } from "@/lib/home/read-brain-health";
import { readQueueSummary } from "@/lib/home/read-queue-summary";
import { readTeamActivity } from "@/lib/home/read-team-activity";
import { readPendingRecommendations } from "@/lib/loop3/read-recommendations";
import { HomeDashboard } from "./_components/HomeDashboard";

export const dynamic = "force-dynamic";

export const metadata = { title: "Home · BBC" };

/**
 * Admin home dashboard. Non-admins (operator/member/viewer) get bounced to
 * /studio/<templateSlug> — they don't need the at-a-glance view; their
 * Studio is the default surface.
 *
 * Loads four widgets' data in parallel (brain health, queue summary,
 * Loop 3 recommendations, 7-day team activity) so the page TTFB stays
 * close to the slowest single read.
 */
export default async function HomePage() {
  const a = await requireActor();
  if (!a.ok) redirect("/auth/signin?callbackUrl=/home");
  if (a.actor.role !== "admin") {
    const slug = (a.actor.templateSlug ?? "marketing").toLowerCase();
    redirect(`/studio/${slug}`);
  }

  const supabase = await getSupabaseServerClient();
  const [brain, queue, loop3, activity] = await Promise.all([
    readBrainHealth(a.actor.tenant_id),
    readQueueSummary(a.actor.tenant_id),
    readPendingRecommendations(supabase),
    readTeamActivity(a.actor.tenant_id, { days: 7 }),
  ]);

  return (
    <HomeDashboard
      tenantSlug={a.actor.tenant_slug}
      brain={brain}
      queue={queue}
      loop3={loop3}
      activity={activity}
    />
  );
}
