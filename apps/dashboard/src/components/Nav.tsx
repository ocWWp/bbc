import { getSupabaseServerClient } from "@/lib/supabase/server";
import { listPending } from "@/lib/read-queue";
import { readInbox } from "@/lib/inbox/read-inbox";
import { AppNav } from "./AppNav";

/**
 * Server-side data layer for the in-app primary nav. Fetches the signed-in
 * user, their current workspace, and the pending-queue count (used for the
 * Queue badge), then renders the client-side <AppNav /> which handles route
 * highlighting via `usePathname`.
 *
 * Nav chrome is a 4-route shell (Studio · Memory · Queue · Library). Memory
 * absorbs /sources as a sub-tab; Settings + theme + sign out live in the
 * avatar dropdown.
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
        .select("role, template_slug, tenants:tenant_id(slug)")
        .eq("user_id", user.id)
        .eq("tenant_id", profile.tenant_id)
        .single();

      const slug = (membership?.tenants as { slug: string } | null)?.slug ?? null;
      if (slug && membership?.role) {
        workspaceProps = {
          name: slug,
          role: membership.role,
          templateSlug: membership.template_slug ?? null,
        };
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

  // Inbox view for the bell badge + slide-out. Fail-open same as queue —
  // the bell hides itself when unauth (the AppNav renders no bell unless
  // user is set).
  let inboxUnread = 0;
  let inboxPreview: Awaited<ReturnType<typeof readInbox>>["from_bbc"] = [];
  if (user) {
    try {
      const inbox = await readInbox(5);
      inboxUnread = inbox.from_bbc_unread;
      inboxPreview = inbox.from_bbc;
    } catch {
      inboxUnread = 0;
      inboxPreview = [];
    }
  }

  return (
    <AppNav
      pendingCount={pendingCount}
      user={userProps}
      workspace={workspaceProps}
      inboxUnread={inboxUnread}
      inboxPreview={inboxPreview}
    />
  );
}
