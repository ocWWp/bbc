import { redirect } from "next/navigation";
import { requireActor } from "@/lib/auth/require-user";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { readBrainHealth } from "@/lib/home/read-brain-health";
import { readQueueSummary } from "@/lib/home/read-queue-summary";
import { readTeamActivity } from "@/lib/home/read-team-activity";
import { readPendingRecommendations } from "@/lib/loop3/read-recommendations";
import { AdminDashboard } from "./_components/AdminDashboard";

export const dynamic = "force-dynamic";

export const metadata = { title: "Dashboard · BBC" };

/**
 * Admin-only at-a-glance dashboard. The 4 widgets (brain health, queue
 * summary, Loop 3 recommendations, 7-day team activity) used to squat
 * at /home — splitting them off lets /home become the chat-home for
 * all acting roles.
 *
 * Viewer → /brain (read-only). Member/operator → /home (chat-home).
 */
export default async function DashboardPage() {
  const a = await requireActor();
  if (!a.ok) redirect("/auth/signin?callbackUrl=/dashboard");
  if (a.actor.role === "viewer") redirect("/brain");
  if (a.actor.role !== "admin") redirect("/home");

  const supabase = await getSupabaseServerClient();
  const [brain, queue, loop3, activity] = await Promise.all([
    readBrainHealth(a.actor.tenant_id),
    readQueueSummary(a.actor.tenant_id),
    readPendingRecommendations(supabase),
    readTeamActivity(a.actor.tenant_id, { days: 7 }),
  ]);

  return (
    <AdminDashboard
      tenantSlug={a.actor.tenant_slug}
      brain={brain}
      queue={queue}
      loop3={loop3}
      activity={activity}
    />
  );
}
