import { redirect } from "next/navigation";
import { requireActor } from "@/lib/auth/require-user";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Root route. Fresh tenants (zero memories) get routed to /welcome so the
 * onboarding flow actually fires — otherwise the Queue is the dashboard.
 * Unauthenticated users land on /queue which then bounces to /auth/signin.
 */
export default async function Root() {
  const a = await requireActor();
  if (!a.ok) redirect("/queue");

  const supabase = await getSupabaseServerClient();
  const { count } = await supabase
    .from("memory_files")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", a.actor.tenant_id);

  if ((count ?? 0) === 0) redirect("/welcome");
  redirect("/queue");
}
