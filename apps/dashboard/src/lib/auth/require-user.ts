import { getSupabaseServerClient } from "@/lib/supabase/server";

export type Role = "admin" | "operator" | "member" | "viewer";

export type Actor = {
  user_id: string;
  provider: "github" | "google" | "email";
  identifier: string;
  /** Stable string fed to bbc/scripts/{accept,reject}.sh as --actor. */
  actor: string;
  /** Tenant context: which BBC instance this user is operating on. */
  tenant_id: string;
  tenant_slug: string;
  /** Role in the current tenant. Server actions gate on this. */
  role: Role;
};

const ACTOR_RE = /^human:(github|google|email):[A-Za-z0-9._%+@-]{1,254}$/;

/**
 * Resolve the signed-in user's BBC actor (identity + tenant + role).
 *
 * Tenant resolution: Phase 1 picks the user's first-joined tenant (matches
 * auth_tenant() SQL function). Phase 6+ may add explicit tenant switching.
 *
 * Returns { ok: false, output } for unauth / missing profile / no tenant
 * membership / bad shape.
 */
export async function requireActor(): Promise<
  { ok: true; actor: Actor } | { ok: false; output: string }
> {
  const supabase = await getSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, output: "unauthorized: sign in required" };

  // Single round-trip: profile gives identity; tenant_members gives role + tenant_id;
  // tenants gives slug. RLS lets the user see their own profile + their own tenant
  // memberships, so this works without service_role.
  const { data: profile, error: pErr } = await supabase
    .from("profiles")
    .select("provider, identifier, tenant_id")
    .eq("user_id", user.id)
    .single();

  if (pErr || !profile) {
    return { ok: false, output: "unauthorized: missing profile" };
  }

  const { data: membership, error: mErr } = await supabase
    .from("tenant_members")
    .select("role, tenants:tenant_id(slug)")
    .eq("user_id", user.id)
    .eq("tenant_id", profile.tenant_id)
    .single();

  if (mErr || !membership) {
    return { ok: false, output: "unauthorized: not a member of any tenant" };
  }

  const tenantSlug = (membership.tenants as { slug: string } | null)?.slug;
  if (!tenantSlug) {
    return { ok: false, output: "unauthorized: tenant resolution failed" };
  }

  const provider = profile.provider as Actor["provider"];
  const role = membership.role as Role;
  const actor = `human:${provider}:${profile.identifier}`;
  if (!ACTOR_RE.test(actor)) {
    return { ok: false, output: "unauthorized: invalid actor shape" };
  }

  return {
    ok: true,
    actor: {
      user_id: user.id,
      provider,
      identifier: profile.identifier,
      actor,
      tenant_id: profile.tenant_id,
      tenant_slug: tenantSlug,
      role,
    },
  };
}

/**
 * Server-action gate: require a tenant role of at least `min`.
 * Hierarchy: admin > operator > member > viewer.
 *
 * Per ADR-0012: 'operator' sits between admin and member. Existing 'member'
 * rows migrate to 'operator' in 0038. The new 'member' role is read-only-
 * plus-propose for invited teammates.
 */
export function requireRole(actor: Actor, min: Role): { ok: true } | { ok: false; output: string } {
  const rank: Record<Role, number> = { viewer: 0, member: 1, operator: 2, admin: 3 };
  if (rank[actor.role] < rank[min]) {
    return {
      ok: false,
      output: `forbidden: this action requires ${min}; you are ${actor.role}`,
    };
  }
  return { ok: true };
}
