import type { ReactNode } from "react";
import { requireActor } from "@/lib/auth/require-user";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { loadBrainSummary } from "@/lib/studio/brain-summary";
import { readRecentDrafts } from "@/lib/studio/read-recent-drafts";
import { ROLE_SHAPES } from "@/lib/studio/role-shapes";
import type { StudioRole } from "@/lib/studio/template-id";
import { StudioShell } from "./StudioShell";
import { RecentDrafts } from "./RecentDrafts";
import { BrainSidebar } from "./BrainSidebar";

export type StudioPageShellProps = {
  role: StudioRole;
  children: ReactNode;
};

/**
 * Task 22: server-side wrapper each Studio page renders. Loads brain
 * summary + recent drafts for the actor's tenant, then composes them into
 * StudioShell around the page's existing content (the `children` slot).
 *
 * Per codex P2 constraint: no behavioral changes. Each role's existing
 * client (Marketing's router/proposal/config/review/override; the four
 * direct-run studios) stays untouched and renders inside StudioShell's
 * bodySlot. The shell adds header chrome + recent-drafts list + role-
 * shaped brain sidebar around the existing tree.
 *
 * Falls back to rendering children naked when no actor is available
 * (the page itself does its own auth redirect — this is defense in depth).
 */
export async function StudioPageShell({ role, children }: StudioPageShellProps) {
  const a = await requireActor();
  if (!a.ok) return <>{children}</>;

  const shape = ROLE_SHAPES[role];
  const supabase = await getSupabaseServerClient();
  const [brain, drafts] = await Promise.all([
    loadBrainSummary(supabase, a.actor.tenant_id),
    readRecentDrafts(role, 8),
  ]);

  return (
    <StudioShell
      role={role}
      tenantName={a.actor.tenant_slug}
      templateSlug={a.actor.templateSlug}
      accentColor={shape.accentColor}
      recentDraftsSlot={
        <RecentDrafts
          items={drafts}
          // Marketing's client can reopen a past run pre-filled with its task +
          // inputs; other Studios just link to the read-only run page.
          rerunHref={
            role === "marketing" ? (id) => `/studio/marketing?rerun=${id}` : undefined
          }
        />
      }
      sidebarSlot={<BrainSidebar shape={shape} brain={brain} />}
      bodySlot={children}
    />
  );
}
