import { redirect } from "next/navigation";
import { requireActor } from "@/lib/auth/require-user";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Root route. Routing logic, in order:
 *   1. Unauthenticated → /queue (which bounces to /auth/signin).
 *   2. Authenticated + empty brain → /welcome (preserves the onboarding gate).
 *   3. Viewer (read-only role) → /brain — they can't act, so the chat-home
 *      isn't useful; route to the memory browser instead.
 *   4. Member / operator / admin → /home (the chat-home).
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

  if (a.actor.role === "viewer") redirect("/brain");

  redirect("/home");
}
