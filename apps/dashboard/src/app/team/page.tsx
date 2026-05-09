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
  created_at: string;
};

export default async function TeamPage({ searchParams }: { searchParams: SearchParams }) {
  const { ok, error } = await searchParams;
  const a = await requireActor();
  if (!a.ok) redirect("/auth/signin?callbackUrl=/team");
  const isAdmin = a.actor.role === "admin";

  const sb = await getSupabaseServerClient();

  const { data: members } = await sb
    .from("tenant_members")
    .select("user_id, role, joined_at")
    .order("joined_at", { ascending: true });

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
    .select("id, provider, identifier, role, created_at")
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
              <th style={{ padding: 8 }}>Role</th>
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
              return (
                <tr key={m.user_id} style={{ borderBottom: "1px solid #eee" }}>
                  <td style={{ padding: 8 }}>
                    {label}
                    {isSelf && <span className="muted"> (you)</span>}
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
                <th style={{ padding: 8 }}>Role</th>
                <th style={{ padding: 8 }}>Invited</th>
                {isAdmin && <th style={{ padding: 8 }}>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {pending.map((inv) => (
                <tr key={inv.id} style={{ borderBottom: "1px solid #eee" }}>
                  <td style={{ padding: 8 }}>
                    {inv.provider}:{inv.identifier}
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
              ))}
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
            <select name="role" defaultValue="member">
              <option value="admin">admin</option>
              <option value="member">member</option>
              <option value="viewer">viewer</option>
            </select>
            <button type="submit" className="btn primary">Invite</button>
          </form>
          <p className="mono-sm muted" style={{ marginTop: 8 }}>
            The invited identity can sign up via /auth/signin and will land in this tenant
            with the selected role.
          </p>
        </section>
      )}
    </main>
  );
}
