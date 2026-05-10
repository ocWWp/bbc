import { redirect } from "next/navigation";
import { requireActor } from "@/lib/auth/require-user";
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
  role: "admin" | "member" | "viewer";
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
  role: "admin" | "member" | "viewer";
  template_slug: string | null;
  created_at: string;
};

type TemplateRow = {
  slug: string;
  display_name: string;
  description: string;
  base_role: "admin" | "member" | "viewer";
  focus_areas: string[];
};

export default async function TeamPage({ searchParams }: { searchParams: SearchParams }) {
  const { ok, error } = await searchParams;
  const a = await requireActor();
  if (!a.ok) redirect("/auth/signin?callbackUrl=/team");
  const isAdmin = a.actor.role === "admin";

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
  // Filter out invitations that have already been redeemed (matching profile exists).
  const redeemed = new Set(
    ((profiles ?? []) as ProfileRow[]).map(
      (p) => `${p.provider}:${p.identifier}`,
    ),
  );
  const pending = invitationRows.filter(
    (inv) => !redeemed.has(`${inv.provider}:${inv.identifier}`),
  );

  return (
    <main style={{ maxWidth: 880, margin: "32px auto", padding: 24 }}>
      <h1>Team</h1>
      <p className="muted" style={{ marginBottom: 16 }}>
        Tenant: <strong>{a.actor.tenant_slug}</strong>. Your role: <strong>{a.actor.role}</strong>.
        {!isAdmin && " Only admins can manage members."}
      </p>
      {error && (
        <div className="banner warn" style={{ marginBottom: 16 }}>
          {error}
        </div>
      )}
      {ok && (
        <div className="banner ok" style={{ marginBottom: 16 }}>
          {ok}
        </div>
      )}

      <section style={{ marginBottom: 32 }}>
        <h2>Members ({memberRows.length})</h2>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #ccc", textAlign: "left" }}>
              <th style={{ padding: 8 }}>Identity</th>
              <th style={{ padding: 8 }}>Template</th>
              <th style={{ padding: 8 }}>Base role</th>
              <th style={{ padding: 8 }}>Joined</th>
              {isAdmin && <th style={{ padding: 8 }}>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {memberRows.map((m) => {
              const profile = profileById.get(m.user_id);
              const label = profile
                ? `${profile.provider}:${profile.identifier}`
                : m.user_id;
              const isSelf = m.user_id === a.actor.user_id;
              const tmpl = m.template_slug ? templateBySlug.get(m.template_slug) : null;
              return (
                <tr key={m.user_id} style={{ borderBottom: "1px solid #eee" }}>
                  <td style={{ padding: 8 }}>
                    {label}
                    {isSelf && <span className="muted"> (you)</span>}
                  </td>
                  <td style={{ padding: 8 }}>
                    {tmpl ? tmpl.display_name : m.template_slug ?? "(none)"}
                  </td>
                  <td style={{ padding: 8 }}>{m.role}</td>
                  <td style={{ padding: 8 }} className="mono-sm">
                    {m.joined_at.slice(0, 10)}
                  </td>
                  {isAdmin && (
                    <td style={{ padding: 8 }}>
                      {!isSelf && (
                        <>
                          <form action={changeMemberRole} style={{ display: "inline-block", marginRight: 8 }}>
                            <input type="hidden" name="user_id" value={m.user_id} />
                            <select name="new_role" defaultValue={m.role} style={{ marginRight: 4 }}>
                              <option value="admin">admin</option>
                              <option value="member">member</option>
                              <option value="viewer">viewer</option>
                            </select>
                            <button type="submit" className="btn">Save</button>
                          </form>
                          <form action={removeMember} style={{ display: "inline-block" }}>
                            <input type="hidden" name="user_id" value={m.user_id} />
                            <button type="submit" className="btn warn">Remove</button>
                          </form>
                        </>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2>Pending invitations ({pending.length})</h2>
        {pending.length === 0 ? (
          <p className="muted">No pending invitations.</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #ccc", textAlign: "left" }}>
                <th style={{ padding: 8 }}>Identity</th>
                <th style={{ padding: 8 }}>Template</th>
                <th style={{ padding: 8 }}>Base role</th>
                <th style={{ padding: 8 }}>Invited</th>
                {isAdmin && <th style={{ padding: 8 }}>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {pending.map((inv) => {
                const invTmpl = inv.template_slug ? templateBySlug.get(inv.template_slug) : null;
                return (
                <tr key={inv.id} style={{ borderBottom: "1px solid #eee" }}>
                  <td style={{ padding: 8 }}>
                    {inv.provider}:{inv.identifier}
                  </td>
                  <td style={{ padding: 8 }}>
                    {invTmpl ? invTmpl.display_name : inv.template_slug ?? "(none)"}
                  </td>
                  <td style={{ padding: 8 }}>{inv.role}</td>
                  <td style={{ padding: 8 }} className="mono-sm">
                    {inv.created_at.slice(0, 10)}
                  </td>
                  {isAdmin && (
                    <td style={{ padding: 8 }}>
                      <form action={revokeInvitation}>
                        <input type="hidden" name="id" value={inv.id} />
                        <button type="submit" className="btn warn">Revoke</button>
                      </form>
                    </td>
                  )}
                </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      {isAdmin && (
        <section>
          <h2>Invite someone</h2>
          <form
            action={inviteMember}
            style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}
          >
            <select name="provider" defaultValue="email">
              <option value="email">email</option>
              <option value="github">github</option>
              <option value="google">google</option>
            </select>
            <input
              type="text"
              name="identifier"
              placeholder="email@domain.com or github-login"
              required
              style={{ minWidth: 280 }}
            />
            <select name="template_slug" defaultValue="engineering">
              {templateRows.map((t) => (
                <option key={t.slug} value={t.slug} title={t.description}>
                  {t.display_name} ({t.base_role})
                </option>
              ))}
            </select>
            <button type="submit" className="btn primary">Invite</button>
          </form>
          <p className="mono-sm muted" style={{ marginTop: 8 }}>
            The invited identity gets an email (if RESEND_API_KEY is set) with a link that pre-fills
            their email at signup. The template determines their base role and focus areas.
          </p>

          <details style={{ marginTop: 16 }}>
            <summary className="mono-sm" style={{ cursor: "pointer", color: "#888" }}>
              ▸ What does each template grant?
            </summary>
            <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 8, fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #ccc", textAlign: "left" }}>
                  <th style={{ padding: 6 }}>Template</th>
                  <th style={{ padding: 6 }}>Base role</th>
                  <th style={{ padding: 6 }}>Focus areas</th>
                  <th style={{ padding: 6 }}>What it does</th>
                </tr>
              </thead>
              <tbody>
                {templateRows.map((t) => (
                  <tr key={t.slug} style={{ borderBottom: "1px solid #eee" }}>
                    <td style={{ padding: 6 }}><strong>{t.display_name}</strong></td>
                    <td style={{ padding: 6 }}>{t.base_role}</td>
                    <td style={{ padding: 6 }} className="mono-sm">{t.focus_areas.join(", ")}</td>
                    <td style={{ padding: 6 }}>{t.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </section>
      )}
    </main>
  );
}
