# @bbc/mcp-server

Model Context Protocol bridge for BBC. Lets agents (Claude Desktop, Cursor, custom) read and write a tenant's BBC instance over HTTP using a per-tenant API key.

## Phase 6 status

Phase 6 ships **read-only** tools. The write tools (`propose_change`, `accept_proposal`, `reject_proposal`) ship in a follow-up that wires `supabase.rpc()` to the existing `accept_proposal()` / `reject_proposal()` SQL functions through an `agent:<key_id>` actor identity.

## Tools

| Tool | Args | Returns |
|---|---|---|
| `read_memory` | `path` | One row from `memory_files` (path, frontmatter, content, updated_at) |
| `list_queue` | `status?`, `limit?` | Queue items for the tenant filtered by status (default `pending`) |
| `read_log` | `limit?` | Most-recent operations_log entries for the tenant |

## Auth

Format: `bbc_<key_id>.<secret>`. Issue via the dashboard's `/team` page (admin-only) or directly via SQL:

```sql
select public.create_api_key('my-agent', 'read');  -- returns the token once
```

Pass on the wire as a standard bearer token:

```
Authorization: Bearer bbc_<key_id>.<secret>
```

The server resolves the token via the `resolve_api_key()` SQL function, which validates the bcrypt hash and returns the `(tenant_id, scope, key_id)` tuple. `last_used_at` is updated on every successful resolution.

## Local dev

From the bbc/ monorepo root:

```bash
pnpm install
# ensure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are exported, or set
# them in apps/mcp-server/.env.local

pnpm --filter @bbc/mcp-server dev    # starts on http://localhost:4501
```

Health check: `curl http://localhost:4501/health` → `{"ok":true,"name":"bbc-mcp","version":"0.1.0"}`.

## Wiring into Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS):

```json
{
  "mcpServers": {
    "bbc": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/inspector", "http", "https://mcp.bbc.tools/mcp"],
      "env": {
        "AUTHORIZATION": "Bearer bbc_<key_id>.<secret>"
      }
    }
  }
}
```

The exact configuration depends on Claude Desktop's HTTP-transport wiring (the SDK's HTTP client is still maturing). For local dev, point at `http://localhost:4501/mcp`.

## Production deploy

Phase 9 (production deploy) wires this to `mcp.bbc.tools` on Fly.io or Railway. Vercel is not a fit — MCP needs a long-lived process for streamable HTTP, not serverless function executions.

## Security notes

- The server runs as **service_role** under the hood (the `SUPABASE_SERVICE_ROLE_KEY` env var). It bypasses RLS at the connection layer; every query in `src/tools/*.ts` explicitly filters on the resolved `tenant_id` from the API key. **Do not relax this.** A missing `.eq("tenant_id", ctx.tenant_id)` is a cross-tenant leak.
- API keys are hashed (bcrypt cost 10) at rest. The plaintext is shown to the user once, at creation, and never persisted.
- Revoked keys are rejected by `resolve_api_key()` (the `revoked_at` predicate).
- API keys are tenant-scoped, not user-scoped. Multiple admins of the same tenant share key issuance authority.
