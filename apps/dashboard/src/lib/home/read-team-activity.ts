import "server-only";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export type TeamMemberActivity = {
  user_id: string;
  display_name: string;
  role: string; // 'admin' | 'operator' | 'member' | 'viewer'
  template_slug: string | null;
  drafts_this_week: number;
  flags_filed: number;
};

export type TeamActivity = {
  members: TeamMemberActivity[];
};

const DAY_MS = 86_400_000;

/**
 * 7-day team activity per tenant member: drafts (studio_runs by created_by)
 * + flags filed (queue_items where frontmatter.change_kind='flag' AND
 * frontmatter.proposed_by=user_id, per Task 0d's propose_change RPC shape).
 *
 * Joins tenant_members (role, template_slug) and profiles (display_name,
 * identifier) — tenant_members has no display name field, so the join is
 * mandatory.
 */
export async function readTeamActivity(
  tenantId: string,
  opts: { days?: number } = {},
): Promise<TeamActivity> {
  const days = opts.days ?? 7;
  const since = new Date(Date.now() - days * DAY_MS).toISOString();
  const supabase = await getSupabaseServerClient();

  const [membersResult, runsResult, flagsResult] = await Promise.all([
    supabase
      .from("tenant_members")
      .select("user_id, role, template_slug, profiles:user_id(display_name, identifier)")
      .eq("tenant_id", tenantId),
    supabase
      .from("studio_runs")
      .select("created_by, created_at")
      .eq("tenant_id", tenantId)
      .gte("created_at", since),
    supabase
      .from("queue_items")
      .select("frontmatter, created_at")
      .eq("tenant_id", tenantId)
      .gte("created_at", since),
  ]);

  type MemberRow = {
    user_id: string;
    role: string;
    template_slug: string | null;
    profiles: { display_name: string | null; identifier: string | null } | null;
  };
  type RunRow = { created_by: string };
  type FlagRow = { frontmatter: Record<string, unknown> | null };

  const memberRows = (membersResult.data ?? []) as MemberRow[];
  const runs = (runsResult.data ?? []) as RunRow[];
  const queueRows = (flagsResult.data ?? []) as FlagRow[];

  const draftsByUser = new Map<string, number>();
  for (const r of runs) {
    if (!r.created_by) continue;
    draftsByUser.set(r.created_by, (draftsByUser.get(r.created_by) ?? 0) + 1);
  }

  const flagsByUser = new Map<string, number>();
  for (const q of queueRows) {
    const fm = q.frontmatter ?? {};
    const kind = (fm as Record<string, unknown>).change_kind;
    const proposedBy = (fm as Record<string, unknown>).proposed_by;
    if (kind === "flag" && typeof proposedBy === "string") {
      flagsByUser.set(proposedBy, (flagsByUser.get(proposedBy) ?? 0) + 1);
    }
  }

  const members: TeamMemberActivity[] = memberRows.map((m) => {
    const displayName =
      m.profiles?.display_name?.trim() ||
      m.profiles?.identifier?.trim() ||
      m.user_id.slice(0, 8);
    return {
      user_id: m.user_id,
      display_name: displayName,
      role: m.role,
      template_slug: m.template_slug,
      drafts_this_week: draftsByUser.get(m.user_id) ?? 0,
      flags_filed: flagsByUser.get(m.user_id) ?? 0,
    };
  });

  // Most active first; flags break the tie.
  members.sort((a, b) => {
    if (b.drafts_this_week !== a.drafts_this_week) {
      return b.drafts_this_week - a.drafts_this_week;
    }
    return b.flags_filed - a.flags_filed;
  });

  return { members };
}
