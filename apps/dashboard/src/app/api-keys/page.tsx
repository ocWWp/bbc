import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireActor } from "@/lib/auth/require-user";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { KNOWN_API_KEY_ROLES, ROLE_MEMORY_TYPES } from "@/lib/api-auth";
import { createApiKey, revokeApiKey } from "./actions";
import MCPTester from "./MCPTester";

async function mcpEndpoint(): Promise<string> {
  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}/api/mcp`;
}

export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  ok?: string;
  error?: string;
  token?: string;
  name?: string;
  scope?: string;
  role?: string;
}>;

type KeyRow = {
  id: string;
  key_id: string;
  scope: "read" | "write" | "admin";
  name: string;
  role: string | null;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
};

export default async function ApiKeysPage({ searchParams }: { searchParams: SearchParams }) {
  const { ok, error, token, name: tokenName, scope: tokenScope, role: tokenRole } = await searchParams;

  const a = await requireActor();
  if (!a.ok) redirect("/auth/signin?callbackUrl=/api-keys");
  const isAdmin = a.actor.role === "admin";

  const sb = await getSupabaseServerClient();
  // The role column was added in migration 0031; the generated TS types are
  // stale (regen pending). PostgREST returns it correctly -- cast through.
  const { data: keys } = await sb
    .from("api_keys")
    .select("id, key_id, scope, name, role, created_at, last_used_at, revoked_at" as never)
    .order("created_at", { ascending: false });

  const all = (keys ?? []) as unknown as KeyRow[];
  const active = all.filter((k) => !k.revoked_at);
  const revoked = all.filter((k) => k.revoked_at);
  const endpoint = await mcpEndpoint();

  return (
    <main style={{ maxWidth: 880, margin: "32px auto", padding: 24 }}>
      <h1>API keys</h1>
      <p className="muted" style={{ marginBottom: 16 }}>
        Tenant: <strong>{a.actor.tenant_slug}</strong>. Your role: <strong>{a.actor.role}</strong>.
        Tokens authenticate the BBC MCP server (<code>/api/mcp</code>) and the REST shim (<code>/api/v1/brain/*</code>).
        {!isAdmin && " Only admins can create or revoke keys."}
      </p>

      <section
        style={{
          marginBottom: 24,
          padding: 12,
          border: "1px solid var(--border, #ddd)",
          borderRadius: 6,
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
          MCP endpoint
        </div>
        <code style={{ userSelect: "all", fontSize: 13 }}>{endpoint}</code>
        <div className="mono-sm muted" style={{ marginTop: 6 }}>
          Pass <code>Authorization: Bearer &lt;token&gt;</code>. Read-scope keys can call
          all <em>list/get/search</em> tools; write-scope keys can also call <code>submit_memory</code>.
        </div>
      </section>

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

      {token && (
        <div
          className="banner ok"
          style={{
            marginBottom: 24,
            padding: 16,
            border: "2px solid #0a0",
            background: "#efe",
          }}
        >
          <h3 style={{ marginTop: 0 }}>Save this token NOW</h3>
          <p>
            Key <strong>{tokenName}</strong> ({tokenScope}
            {tokenRole && tokenRole !== "none" ? `, role=${tokenRole}` : ""}) was created. The
            plaintext is shown below ONCE. After you navigate away, only the bcrypt hash is
            stored on the server. If you lose this token, revoke it and create a new one.
          </p>
          <pre
            style={{
              padding: 12,
              background: "#000",
              color: "#0f0",
              fontSize: 14,
              overflow: "auto",
              userSelect: "all",
            }}
          >
            {token}
          </pre>
          <p className="mono-sm muted" style={{ marginTop: 8 }}>
            Use as: <code>Authorization: Bearer {token.slice(0, 16)}…</code>
          </p>
          <MCPTester token={token} endpoint={endpoint} />
        </div>
      )}

      <section style={{ marginBottom: 32 }}>
        <h2>Active keys ({active.length})</h2>
        {active.length === 0 ? (
          <p className="muted">No active keys.</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #ccc", textAlign: "left" }}>
                <th style={{ padding: 8 }}>Name</th>
                <th style={{ padding: 8 }}>Key ID</th>
                <th style={{ padding: 8 }}>Scope</th>
                <th style={{ padding: 8 }}>Role</th>
                <th style={{ padding: 8 }}>Created</th>
                <th style={{ padding: 8 }}>Last used</th>
                {isAdmin && <th style={{ padding: 8 }}>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {active.map((k) => (
                <tr key={k.id} style={{ borderBottom: "1px solid #eee" }}>
                  <td style={{ padding: 8 }}>{k.name}</td>
                  <td style={{ padding: 8 }} className="mono-sm">
                    {k.key_id}
                  </td>
                  <td style={{ padding: 8 }}>{k.scope}</td>
                  <td style={{ padding: 8 }} className="mono-sm">
                    {k.role ?? <span className="muted">all</span>}
                  </td>
                  <td style={{ padding: 8 }} className="mono-sm">
                    {k.created_at.slice(0, 10)}
                  </td>
                  <td style={{ padding: 8 }} className="mono-sm">
                    {k.last_used_at ? k.last_used_at.slice(0, 10) : "never"}
                  </td>
                  {isAdmin && (
                    <td style={{ padding: 8 }}>
                      <form action={revokeApiKey}>
                        <input type="hidden" name="key_id" value={k.key_id} />
                        <button type="submit" className="btn warn">
                          Revoke
                        </button>
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
        <section style={{ marginBottom: 32 }}>
          <h2>Issue a new key</h2>
          <form
            action={createApiKey}
            style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}
          >
            <input
              type="text"
              name="name"
              placeholder="my-claude-desktop"
              required
              style={{ minWidth: 220 }}
            />
            <select name="scope" defaultValue="read">
              <option value="read">read</option>
              <option value="write">write</option>
              <option value="admin">admin</option>
            </select>
            <select name="role" defaultValue="none" title="Memory-type allowlist applied to this key">
              <option value="none">all memory (no role)</option>
              {KNOWN_API_KEY_ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            <button type="submit" className="btn primary">
              Create key
            </button>
          </form>
          <details style={{ marginTop: 8 }}>
            <summary className="mono-sm muted">
              What does role do?
            </summary>
            <div className="mono-sm muted" style={{ marginTop: 6 }}>
              A role binds the key to a memory-type allowlist applied at the MCP server +
              REST shim. Unbound keys see every memory type (the default before 0031).
              Bound keys see only the types in their allowlist:
              <ul style={{ marginTop: 4 }}>
                {KNOWN_API_KEY_ROLES.map((r) => (
                  <li key={r}>
                    <code>{r}</code> →{" "}
                    <code>{[...(ROLE_MEMORY_TYPES[r] ?? new Set())].sort().join(", ") || "(empty)"}</code>
                  </li>
                ))}
              </ul>
            </div>
          </details>
          <p className="mono-sm muted" style={{ marginTop: 8 }}>
            Token format <code>bbc_&lt;key_id&gt;.&lt;secret&gt;</code>. Pass as
            <code> Authorization: Bearer &lt;token&gt;</code> when calling the MCP server.
          </p>
        </section>
      )}

      {revoked.length > 0 && (
        <section>
          <h2>Revoked ({revoked.length})</h2>
          <table style={{ width: "100%", borderCollapse: "collapse", opacity: 0.6 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #ccc", textAlign: "left" }}>
                <th style={{ padding: 8 }}>Name</th>
                <th style={{ padding: 8 }}>Key ID</th>
                <th style={{ padding: 8 }}>Scope</th>
                <th style={{ padding: 8 }}>Revoked</th>
              </tr>
            </thead>
            <tbody>
              {revoked.map((k) => (
                <tr key={k.id} style={{ borderBottom: "1px solid #eee" }}>
                  <td style={{ padding: 8 }}>{k.name}</td>
                  <td style={{ padding: 8 }} className="mono-sm">
                    {k.key_id}
                  </td>
                  <td style={{ padding: 8 }}>{k.scope}</td>
                  <td style={{ padding: 8 }} className="mono-sm">
                    {k.revoked_at?.slice(0, 10)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </main>
  );
}
