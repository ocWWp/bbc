import { getSupabaseServerClient } from "@/lib/supabase/server";
import { listPending } from "@/lib/read-queue";
import { AppNav } from "./AppNav";

/**
 * Server-side data layer for the in-app primary nav. Fetches the signed-in
 * user, their current workspace, and the pending-queue count (used for the
 * Queue badge), then renders the client-side <AppNav /> which handles route
 * highlighting via `usePathname`.
 *
 * Nav chrome itself is now a 5-route shell (Studio · Memory · Queue · Sources
 * · Settings) ported from the Claude Design bundle — see app-nav primitives
 * in globals.css. Absorbed routes (skills, bindings, tools, log, team,
 * api-keys, graph) still resolve by URL but no longer occupy primary-nav
 * slots; they live under their parent section.
 */
export default async function Nav() {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  let userProps: React.ComponentProps<typeof AppNav>["user"] = null;
  let workspaceProps: React.ComponentProps<typeof AppNav>["workspace"] = null;

  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("identifier, display_name, avatar_url, tenant_id")
      .eq("user_id", user.id)
      .single();

    const label = profile?.display_name || profile?.identifier || user.email || "user";
    const initial = (label.match(/[a-zA-Z0-9]/)?.[0] || "?").toUpperCase();
    userProps = { label, avatar: profile?.avatar_url ?? null, initial };

    if (profile?.tenant_id) {
      const { data: membership } = await supabase
        .from("tenant_members")
        .select("role, tenants:tenant_id(slug)")
        .eq("user_id", user.id)
        .eq("tenant_id", profile.tenant_id)
        .single();

      const slug = (membership?.tenants as { slug: string } | null)?.slug ?? null;
      if (slug && membership?.role) {
        workspaceProps = { name: slug, role: membership.role };
      }
    }
  }

  // Pending count for the Queue badge. Safe to fail-open: if read-queue
  // throws (file-mode misconfig, etc.) we just show 0 rather than break nav.
  let pendingCount = 0;
  try {
    const pending = await listPending();
    pendingCount = pending.length;
  } catch {
    pendingCount = 0;
  }

  return <AppNav pendingCount={pendingCount} user={userProps} workspace={workspaceProps} />;
}
