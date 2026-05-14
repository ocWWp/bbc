import { redirect } from "next/navigation";
import { requireActor, requireRole } from "@/lib/auth/require-user";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import {
  inviteMember,
  revokeInvitation,
  changeMemberRole,
  removeMember,
} from "./actions";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ ok?: string; error?: string }>;

type MemberRow = {
  user_id: string;
  role: "admin" | "operator" | "member" | "viewer";
  template_slug: string | null;
  joined_at: string;
};

type ProfileRow = {
  user_id: string;
  provider: string;
  identifier: string;
  display_name: string | null;
};

type InvitationRow = {
  id: string;
  provider: string;
  identifier: string;
  role: "admin" | "operator" | "member" | "viewer";
  template_slug: string | null;
  created_at: string;
};

type TemplateRow = {
  slug: string;
  display_name: string;
  description: string;
  base_role: "admin" | "operator" | "member" | "viewer";
  focus_areas: string[];
};

const ROLE_PILL: Record<string, string> = {
  admin: "accent",
  operator: "accent",
  member: "muted",
  viewer: "muted",
};

const inputStyle = {
  height: 32,
  padding: "0 10px",
  fontFamily: "var(--font-geist), sans-serif",
  fontSize: 12.5,
  background: "var(--paper-bg)",
  border: "1px solid var(--paper-rule)",
  borderRadius: 7,
  color: "var(--paper-ink)",
} as const;

const selectStyle = {
  height: 32,
  padding: "0 8px",
  fontFamily: "var(--font-geist-mono), monospace",
  fontSize: 12,
  background: "var(--paper-bg)",
  border: "1px solid var(--paper-rule)",
  borderRadius: 7,
  color: "var(--paper-ink)",
} as const;

export default async function TeamSettingsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { ok, error } = await searchParams;
  const a = await requireActor();
  if (!a.ok) redirect("/auth/signin?callbackUrl=/settings/team");
  // Per ADR-0012: team management (invitations + role changes) is admin-only.
  const adminGate = requireRole(a.actor, "admin");
  if (!adminGate.ok) redirect("/brain");
  const isAdmin = true;

  const sb = await getSupabaseServerClient();

  const { data: members } = await sb
    .from("tenant_members")
    .select("user_id, role, template_slug, joined_at")
    .order("joined_at", { ascending: true });

  const { data: templates } = await sb
    .from("role_templates")
    .select("slug, display_name, description, base_role, focus_areas")
    .order("base_role", { ascending: false });
  const templateRows = (templates ?? []) as TemplateRow[];
  const templateBySlug = new Map(templateRows.map((t) => [t.slug, t]));

  const memberRows = (members ?? []) as MemberRow[];
  const memberIds = memberRows.map((m) => m.user_id);

  const { data: profiles } = memberIds.length
    ? await sb
        .from("profiles")
        .select("user_id, provider, identifier, display_name")
        .in("user_id", memberIds)
    : { data: [] };

  const profileById = new Map(
    ((profiles ?? []) as ProfileRow[]).map((p) => [p.user_id, p]),
  );

  const { data: invitations } = await sb
    .from("tenant_invitations")
    .select("id, provider, identifier, role, template_slug, created_at")
    .order("created_at", { ascending: false });

  const invitationRows = (invitations ?? []) as InvitationRow[];
  const redeemed = new Set(
    ((profiles ?? []) as ProfileRow[]).map((p) => `${p.provider}:${p.identifier}`),
  );
  const pending = invitationRows.filter(
    (inv) => !redeemed.has(`${inv.provider}:${inv.identifier}`),
  );

  return (
    <>
      {error && (
        <div className="banner err">
          <span className="dot" />
          <span style={{ flex: 1 }}>{error}</span>
        </div>
      )}
      {ok && (
        <div className="banner ok">
          <span className="dot" />
          <span style={{ flex: 1 }}>{ok}</span>
        </div>
      )}

      <div className="set-block">
        <div className="set-block-head">
          <div>
            <div className="h">Members · {memberRows.length}</div>
            <div className="sub">
              Anyone in the workspace can read all memory. Write requires admin.
              {!isAdmin && " Only admins can manage members."}
            </div>
          </div>
          {isAdmin && (
            <span className="pill muted">{pending.length} pending invite{pending.length === 1 ? "" : "s"}</span>
          )}
        </div>
        <div>
          {memberRows.map((m) => {
            const profile = profileById.get(m.user_id);
            const label = profile
              ? `${profile.provider}:${profile.identifier}`
              : m.user_id;
            const display = profile?.display_name || profile?.identifier || m.user_id.slice(0, 8);
            const isSelf = m.user_id === a.actor.user_id;
            const tmpl = m.template_slug ? templateBySlug.get(m.template_slug) : null;
            const initial = (display.match(/[a-zA-Z0-9]/)?.[0] || "?").toUpperCase();
            return (
              <div
                key={m.user_id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  padding: "14px 20px",
                  borderBottom: "1px solid var(--paper-rule)",
                  flexWrap: "wrap",
                }}
              >
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: "50%",
                    background: "var(--t-team)",
                    color: "oklch(0.985 0.005 80)",
                    display: "grid",
                    placeItems: "center",
                    fontFamily: "var(--font-geist-mono), monospace",
                    fontSize: 11,
                    fontWeight: 600,
                    flexShrink: 0,
                  }}
                >
                  {initial}
                </div>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ fontWeight: 500, color: "var(--paper-ink)", fontSize: 14 }}>
                    {display}
                    {isSelf && (
                      <span
                        className="mono"
                        style={{ marginLeft: 6, fontSize: 11, color: "var(--paper-muted)" }}
                      >
                        (you)
                      </span>
                    )}
                  </div>
                  <div
                    className="mono"
                    style={{ fontSize: 11.5, color: "var(--paper-muted)" }}
                  >
                    {label} · joined {m.joined_at.slice(0, 10)}
                    {tmpl && ` · template: ${tmpl.display_name}`}
                  </div>
                </div>
                <span className={`pill ${ROLE_PILL[m.role] ?? "muted"}`}>{m.role}</span>
                {isAdmin && !isSelf && (
                  <div style={{ display: "flex", gap: 6 }}>
                    <form action={changeMemberRole} style={{ display: "flex", gap: 6 }}>
                      <input type="hidden" name="user_id" value={m.user_id} />
                      <select name="new_role" defaultValue={m.role} style={selectStyle}>
                        <option value="admin">admin</option>
                        <option value="member">member</option>
                        <option value="viewer">viewer</option>
                      </select>
                      <button
                        type="submit"
                        className="btn btn-ghost"
                        style={{ height: 32, fontSize: 12 }}
                      >
                        save
                      </button>
                    </form>
                    <form action={removeMember}>
                      <input type="hidden" name="user_id" value={m.user_id} />
                      <button
                        type="submit"
                        className="btn btn-ghost"
                        style={{ height: 32, fontSize: 12, color: "var(--paper-err)" }}
                      >
                        remove
                      </button>
                    </form>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {pending.length > 0 && (
        <div className="set-block">
          <div className="set-block-head">
            <div>
              <div className="h">Pending invitations · {pending.length}</div>
              <div className="sub">
                Sent but not yet redeemed. Invites pre-fill identity at signup.
              </div>
            </div>
          </div>
          <div>
            {pending.map((inv) => {
              const invTmpl = inv.template_slug ? templateBySlug.get(inv.template_slug) : null;
              return (
                <div
                  key={inv.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                    padding: "12px 20px",
                    borderBottom: "1px solid var(--paper-rule)",
                    flexWrap: "wrap",
                  }}
                >
                  <span
                    className="mono"
                    style={{ fontSize: 12.5, color: "var(--paper-ink-2)", flex: 1, minWidth: 200 }}
                  >
                    {inv.provider}:{inv.identifier}
                  </span>
                  <span
                    className="mono"
                    style={{ fontSize: 11.5, color: "var(--paper-muted)" }}
                  >
                    {invTmpl ? invTmpl.display_name : inv.template_slug ?? "none"}
                  </span>
                  <span className={`pill ${ROLE_PILL[inv.role] ?? "muted"}`}>{inv.role}</span>
                  <span
                    className="mono"
                    style={{ fontSize: 11, color: "var(--paper-muted)" }}
                  >
                    {inv.created_at.slice(0, 10)}
                  </span>
                  {isAdmin && (
                    <form action={revokeInvitation}>
                      <input type="hidden" name="id" value={inv.id} />
                      <button
                        type="submit"
                        className="btn btn-ghost"
                        style={{ height: 28, fontSize: 11.5 }}
                      >
                        revoke
                      </button>
                    </form>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {isAdmin && (
        <div className="set-block">
          <div className="set-block-head">
            <div>
              <div className="h">Invite someone</div>
              <div className="sub">
                The identity gets an email (if RESEND_API_KEY is set) with a
                link pre-filling their address at signup. Template determines
                base role + focus areas.
              </div>
            </div>
          </div>
          <div style={{ padding: 20 }}>
            <form
              action={inviteMember}
              style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}
            >
              <select name="provider" defaultValue="email" style={selectStyle}>
                <option value="email">email</option>
                <option value="github">github</option>
                <option value="google">google</option>
              </select>
              <input
                type="text"
                name="identifier"
                placeholder="email@domain.com or github-login"
                required
                style={{ ...inputStyle, minWidth: 260 }}
              />
              <select
                name="template_slug"
                defaultValue="engineering"
                style={selectStyle}
              >
                {templateRows.map((t) => (
                  <option key={t.slug} value={t.slug} title={t.description}>
                    {t.display_name} ({t.base_role})
                  </option>
                ))}
              </select>
              <button type="submit" className="btn btn-primary">
                + invite
              </button>
            </form>
          </div>
        </div>
      )}

      {isAdmin && templateRows.length > 0 && (
        <div className="set-block">
          <div className="set-block-head">
            <div>
              <div className="h">Role templates</div>
              <div className="sub">
                What each template grants. Defined in <code>role_templates</code> (Postgres).
              </div>
            </div>
          </div>
          <div className="set-block-rows">
            {templateRows.map((t) => (
              <div className="row" key={t.slug}>
                <span className="k">{t.slug}</span>
                <span className="v">
                  <strong>{t.display_name}</strong>{" "}
                  <span style={{ color: "var(--paper-muted)", marginLeft: 6 }}>
                    {t.description}
                  </span>
                  <div
                    className="mono"
                    style={{
                      fontSize: 11,
                      color: "var(--paper-muted)",
                      marginTop: 4,
                    }}
                  >
                    base: {t.base_role} · focus: {t.focus_areas.join(", ")}
                  </div>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
