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

export default async function ApiKeysSettingsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { ok, error, token, name: tokenName, scope: tokenScope, role: tokenRole } =
    await searchParams;

  const a = await requireActor();
  if (!a.ok) redirect("/auth/signin?callbackUrl=/settings/api-keys");
  const isAdmin = a.actor.role === "admin";

  const sb = await getSupabaseServerClient();
  const { data: keys } = await sb
    .from("api_keys")
    .select("id, key_id, scope, name, role, created_at, last_used_at, revoked_at" as never)
    .order("created_at", { ascending: false });

  const all = (keys ?? []) as unknown as KeyRow[];
  const active = all.filter((k) => !k.revoked_at);
  const revoked = all.filter((k) => k.revoked_at);
  const endpoint = await mcpEndpoint();

  return (
    <>
      <div className="set-block">
        <div className="set-block-head">
          <div>
            <div className="h">BBC API keys</div>
            <div className="sub">
              Tokens authenticate the BBC MCP server (<code>/api/mcp</code>) and the
              REST shim (<code>/api/v1/brain/*</code>). Pass{" "}
              <code>Authorization: Bearer &lt;token&gt;</code>.
              {!isAdmin && " Only admins can create or revoke keys."}
            </div>
          </div>
          <span className="pill muted">role: {a.actor.role}</span>
        </div>
        <div className="set-block-rows">
          <div className="row">
            <span className="k">mcp endpoint</span>
            <span className="v">
              <code style={{ userSelect: "all" }}>{endpoint}</code>
            </span>
          </div>
          <div className="row">
            <span className="k">scopes</span>
            <span className="v">
              <span className="mono" style={{ color: "var(--paper-muted)" }}>
                read = list/get/search · write = +submit_memory · admin = +manage
              </span>
            </span>
          </div>
        </div>
      </div>

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

      {token && (
        <div
          className="set-block"
          style={{ borderColor: "color-mix(in oklab, var(--paper-accent), transparent 60%)" }}
        >
          <div className="set-block-head">
            <div>
              <div className="h">Save this token now</div>
              <div className="sub">
                Key <strong>{tokenName}</strong> ({tokenScope}
                {tokenRole && tokenRole !== "none" ? `, role=${tokenRole}` : ""}) was
                created. The plaintext is shown <strong>once</strong>. After you
                navigate away, only the bcrypt hash is stored.
              </div>
            </div>
            <span className="pill accent">one-time reveal</span>
          </div>
          <div style={{ padding: 20 }}>
            <pre
              style={{
                padding: 16,
                background: "var(--paper-bg-3)",
                color: "var(--paper-ink)",
                fontSize: 13,
                fontFamily: "var(--font-geist-mono), monospace",
                overflow: "auto",
                userSelect: "all",
                borderRadius: 8,
                margin: 0,
                border: "1px solid var(--paper-rule)",
              }}
            >
              {token}
            </pre>
            <p
              className="mono"
              style={{ fontSize: 11.5, color: "var(--paper-muted)", marginTop: 10 }}
            >
              Use as: <code>Authorization: Bearer {token.slice(0, 16)}…</code>
            </p>
            <div style={{ marginTop: 14 }}>
              <MCPTester token={token} endpoint={endpoint} />
            </div>
          </div>
        </div>
      )}

      <div className="set-block">
        <div className="set-block-head">
          <div>
            <div className="h">Active keys · {active.length}</div>
            <div className="sub">
              Role allowlist is per-key. The MCP server enforces it before any read
              or write.
            </div>
          </div>
          {isAdmin && (
            <form
              action={createApiKey}
              style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}
            >
              <input
                type="text"
                name="name"
                placeholder="my-claude-desktop"
                required
                style={{
                  minWidth: 180,
                  height: 32,
                  padding: "0 10px",
                  fontFamily: "var(--font-geist), sans-serif",
                  fontSize: 12.5,
                  background: "var(--paper-bg)",
                  border: "1px solid var(--paper-rule)",
                  borderRadius: 7,
                  color: "var(--paper-ink)",
                }}
              />
              <select
                name="scope"
                defaultValue="read"
                style={{
                  height: 32,
                  padding: "0 8px",
                  fontFamily: "var(--font-geist-mono), monospace",
                  fontSize: 12,
                  background: "var(--paper-bg)",
                  border: "1px solid var(--paper-rule)",
                  borderRadius: 7,
                  color: "var(--paper-ink)",
                }}
              >
                <option value="read">read</option>
                <option value="write">write</option>
                <option value="admin">admin</option>
              </select>
              <select
                name="role"
                defaultValue="none"
                title="Memory-type allowlist applied to this key"
                style={{
                  height: 32,
                  padding: "0 8px",
                  fontFamily: "var(--font-geist-mono), monospace",
                  fontSize: 12,
                  background: "var(--paper-bg)",
                  border: "1px solid var(--paper-rule)",
                  borderRadius: 7,
                  color: "var(--paper-ink)",
                }}
              >
                <option value="none">all memory</option>
                {KNOWN_API_KEY_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
              <button type="submit" className="btn btn-primary">
                + create
              </button>
            </form>
          )}
        </div>
        {active.length === 0 ? (
          <div style={{ padding: "24px 20px" }}>
            <p style={{ color: "var(--paper-muted)", fontSize: 13.5, margin: 0 }}>
              No active keys. Issue one above to start using the MCP server.
            </p>
          </div>
        ) : (
          <div>
            {active.map((k) => (
              <div key={k.id} className="key-row">
                <div>
                  <div className="name">{k.name}</div>
                  <div className="secret">{k.key_id}</div>
                </div>
                <span className="pill muted">
                  {k.scope}
                  {k.role ? ` · ${k.role}` : ""}
                </span>
                <span style={{ color: "var(--paper-muted)" }}>
                  {k.last_used_at ? k.last_used_at.slice(0, 10) : "never"}
                </span>
                {isAdmin ? (
                  <form action={revokeApiKey}>
                    <input type="hidden" name="key_id" value={k.key_id} />
                    <button
                      type="submit"
                      className="btn btn-ghost"
                      style={{ height: 28, fontSize: 11.5 }}
                    >
                      revoke
                    </button>
                  </form>
                ) : (
                  <span style={{ color: "var(--paper-muted)" }}>—</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {isAdmin && (
        <div className="set-block">
          <div className="set-block-head">
            <div>
              <div className="h">What does role do?</div>
              <div className="sub">
                A role binds the key to a memory-type allowlist applied at the MCP
                server + REST shim. Unbound keys see every memory type.
              </div>
            </div>
          </div>
          <div className="set-block-rows">
            {KNOWN_API_KEY_ROLES.map((r) => (
              <div className="row" key={r}>
                <span className="k">{r}</span>
                <span className="v mono" style={{ fontSize: 12 }}>
                  {[...(ROLE_MEMORY_TYPES[r] ?? new Set())].sort().join(", ") ||
                    "(empty)"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {revoked.length > 0 && (
        <div className="set-block" style={{ opacity: 0.6 }}>
          <div className="set-block-head">
            <div>
              <div className="h">Revoked · {revoked.length}</div>
              <div className="sub">Past keys. Cannot be reactivated.</div>
            </div>
          </div>
          <div>
            {revoked.map((k) => (
              <div key={k.id} className="key-row">
                <div>
                  <div className="name">{k.name}</div>
                  <div className="secret">{k.key_id}</div>
                </div>
                <span className="pill muted">{k.scope}</span>
                <span style={{ color: "var(--paper-muted)" }}>
                  {k.revoked_at?.slice(0, 10)}
                </span>
                <span className="pill err" style={{ justifySelf: "end" }}>
                  revoked
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
