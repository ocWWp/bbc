import { redirect } from "next/navigation";
import { requireActor } from "@/lib/auth/require-user";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Root route. Routing logic, in order:
 *   1. Unauthenticated → /queue (which bounces to /auth/signin).
 *   2. Authenticated + empty brain → /welcome (preserves the onboarding gate;
 *      fresh tenants without any memories should not land on /home).
 *   3. Admin → /home.
 *   4. Operator / member → /studio/<templateSlug> (defaulting to 'marketing'
 *      when the actor has no template assigned).
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

  if (a.actor.role === "admin") redirect("/home");

  const slug = (a.actor.templateSlug ?? "marketing").toLowerCase();
  redirect(`/studio/${slug}`);
}
