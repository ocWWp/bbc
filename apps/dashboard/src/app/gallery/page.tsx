import { redirect } from "next/navigation";
import { requireActor } from "@/lib/auth/require-user";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { buildGallery } from "@/lib/studio/gallery";
import GalleryClient, { type RecentRun } from "./GalleryClient";

export const metadata = {
  title: "Gallery · BBC",
};

export const dynamic = "force-dynamic";

export default async function GalleryPage() {
  const a = await requireActor();
  if (!a.ok) {
    redirect(`/auth/signin?callbackUrl=${encodeURIComponent("/gallery")}`);
  }

  // Cross-studio recent runs -- moved here from the retired /studio index.
  const supabase = await getSupabaseServerClient();
  const { data: recentRows } = await supabase
    .from("studio_runs")
    .select("id, template_id, task, status, created_at")
    .eq("tenant_id", a.actor.tenant_id)
    .order("created_at", { ascending: false })
    .limit(20);
  const recentRuns = (recentRows ?? []) as RecentRun[];

  return <GalleryClient templates={buildGallery()} recentRuns={recentRuns} />;
}
