# Cross-tenant RLS manual gut check

D-W6-3 acceptance: two-tenant manual run on staging. Tenant A installs every
v1.5 surface; tenant B (signed in as a different real user) tries direct
Supabase reads/writes against A's rows. **Zero leaks** is the bar.

The automated RLS suite (`*.rls.test.ts` files in this directory) already
covers the four v1.5 tables. This document is the *manual* gut-check —
the version that exercises auth.uid()-bound policies through the actual
Next.js server actions and the publishable-key client, not just the
test harness.

## Why this exists

Automated tests assert against the service-role client switching the
`auth.uid()` JWT claim per case. That catches policy-definition errors,
not auth-flow errors. The manual run catches:

- Session-cookie misuse (one tenant's session reading another's data via
  middleware).
- `requireActor()` mis-resolving the tenant on multi-tenant accounts.
- Server actions that accept tenant_id from the client instead of from
  `requireActor()`.
- Stale react cache surfacing tenant A's data to a tenant B session.
- Direct Supabase REST calls (e.g., via the JS browser client + anon key)
  bypassing server actions entirely.

## Setup

Two real Supabase auth users, two real tenants on the staging project.

| | Tenant | User | Role |
|---|---|---|---|
| A | `acme-rls-test` | `a@example.com` | admin |
| B | `globex-rls-test` | `b@example.com` | admin |

Both users sign in via the same Supabase project (separate browser profiles
or incognito windows; **never share a session**).

Tenant A is the **target**. Tenant B is the **attacker**. Every check below
authenticates as B and attempts to reach A's rows.

## Tenant A — populate every surface

As user `a@example.com`, complete these steps in order. Record IDs as you go.

| | Surface | Action | Note ID |
|---|---|---|---|
| 1 | Memory | Paste a brain-dump at `/memory`, accept 3 extracted memories | memory IDs: TBD |
| 2 | Queue | Confirm 3 accepted proposals land in `queue_items` with `status='accepted'` | queue IDs: TBD |
| 3 | Skills | Import a SKILL.md from a github URL via `/library` admin import | tenant_skills.id: TBD |
| 4 | Connectors | Install Notion + Linear; complete OAuth | tenant_connectors.id: TBD |
| 5 | External accounts | Verify `external_accounts` rows exist for the two connectors | external_accounts.id: TBD |
| 6 | Recommendations | Trigger Loop 3 recommendations (or seed manually via service role) | recommendation IDs: TBD |
| 7 | Webhook DLQ | Replay a webhook event with a bad signature to force a row | DLQ row ID: TBD |
| 8 | API key | Generate an API key at `/settings/api-keys` (scope: read) | api_keys.key_id: TBD |
| 9 | Provider keys | Save an Anthropic key at `/settings/keys` | tenant_keys.id: TBD |
| 10 | Invitations | Create an invitation at `/settings/team` for a third address | invitations.id: TBD |

Capture `tenant_a_id` from the Supabase dashboard (`select id from tenants where slug='acme-rls-test'`).

## Tenant B — attack surface

As user `b@example.com`, run each probe below. Every one must **fail** in the
documented way. A success = leak.

### §1 — Read attempts via the dashboard

| | Probe | Expected | Observed |
|---|---|---|---|
| 1.1 | Visit `/memory` while signed in as B; check rows | only B's tenant's memories (none from A) | TBD |
| 1.2 | Visit `/queue` | only B's queue items | TBD |
| 1.3 | Visit `/library` | empty (B has no installed skills/connectors) | TBD |
| 1.4 | Visit `/library/diagnostics` (B has no admin gate? confirm — should still return 404 if non-admin) | 404 if B is not admin | TBD |
| 1.5 | Force-navigate to `/memory/<A's memory id>` | 404 or "not found" — NOT 403 (don't reveal existence) | TBD |
| 1.6 | Force-navigate to `/queue/<A's queue id>` | 404 | TBD |
| 1.7 | Force-navigate to `/settings/api-keys` and check listed keys | only B's keys | TBD |
| 1.8 | Open `/invite/<A's invitation token>` | resolve_invitation_token returns `out_consumed=true` or rejects (A's token shouldn't grant B access to A's tenant) | TBD |

### §2 — Read attempts via the JS client

Open the browser devtools console while signed in as B. Run:

```js
const { createClient } = supabase;  // publishable key client
const sb = createClient(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);

// 2.1 — memory_files
await sb.from("memory_files").select("*").eq("tenant_id", "<TENANT_A_ID>");
// expected: empty array (RLS filters out A's rows)

// 2.2 — queue_items
await sb.from("queue_items").select("*");
// expected: only B's rows

// 2.3 — tenant_skills
await sb.from("tenant_skills").select("*");
// expected: only B's rows (which is none)

// 2.4 — tenant_connectors
await sb.from("tenant_connectors").select("*");
// expected: only B's rows (none)

// 2.5 — external_accounts
await sb.from("external_accounts").select("*");
// expected: only B's rows (none)

// 2.6 — recommendations
await sb.from("recommendations").select("*");
// expected: only B's rows (none)

// 2.7 — webhook_dead_letters
await sb.from("webhook_dead_letters").select("*");
// expected: only B's rows (none)

// 2.8 — api_keys (display-only fields; secret never leaks)
await sb.from("api_keys").select("*");
// expected: only B's keys

// 2.9 — tenant_keys
await sb.from("tenant_keys").select("*");
// expected: only B's row (display_hint only; ciphertext masked)

// 2.10 — tenants
await sb.from("tenants").select("*");
// expected: only B's tenant row
```

| | Query | Expected | Observed |
|---|---|---|---|
| 2.1 | memory_files where tenant_id = A | 0 rows | TBD |
| 2.2 | queue_items | only B's | TBD |
| 2.3 | tenant_skills | only B's | TBD |
| 2.4 | tenant_connectors | only B's | TBD |
| 2.5 | external_accounts | only B's | TBD |
| 2.6 | recommendations | only B's | TBD |
| 2.7 | webhook_dead_letters | only B's | TBD |
| 2.8 | api_keys | only B's | TBD |
| 2.9 | tenant_keys | only B's | TBD |
| 2.10 | tenants | only B's row | TBD |

### §3 — Write attempts via the JS client

```js
// 3.1 — insert into memory_files with A's tenant_id
await sb.from("memory_files").insert({
  tenant_id: "<TENANT_A_ID>",
  type: "note",
  title: "leak",
  body: "leak",
});
// expected: PostgrestError (RLS rejects the insert)

// 3.2 — update one of A's memory rows (using a known A memory ID from setup)
await sb.from("memory_files")
  .update({ title: "pwned" })
  .eq("id", "<A_MEMORY_ID>");
// expected: 0 rows updated (RLS narrows the rowset)

// 3.3 — delete one of A's rows
await sb.from("memory_files").delete().eq("id", "<A_MEMORY_ID>");
// expected: 0 rows deleted

// 3.4 — insert into tenant_skills as B with installed_by = A's user_id
await sb.from("tenant_skills").insert({
  tenant_id: "<TENANT_B_ID>",
  skill_name: "leak",
  skill_role: "marketing",
  installed_by: "<A_USER_ID>",
  manifest: {},
  body: "",
  body_hash: "",
});
// expected: PostgrestError (installed_by must = auth.uid())

// 3.5 — insert into tenant_connectors with another tenant's external_account_id
await sb.from("tenant_connectors").insert({
  tenant_id: "<TENANT_B_ID>",
  connector_id: "notion",
  external_account_id: "<A_EXTERNAL_ACCOUNT_ID>",
});
// expected: PostgrestError (composite FK rejection)

// 3.6 — insert into recommendations (service-role-only)
await sb.from("recommendations").insert({
  tenant_id: "<TENANT_B_ID>",
  target_kind: "skill",
  target_id: "x",
  state: "pending",
});
// expected: PostgrestError (member writes denied)

// 3.7 — insert into webhook_dead_letters (service-role-only)
await sb.from("webhook_dead_letters").insert({
  tenant_id: "<TENANT_B_ID>",
  reason: "leak",
});
// expected: PostgrestError
```

| | Query | Expected | Observed |
|---|---|---|---|
| 3.1 | insert memory_files with A's tenant_id | rejected | TBD |
| 3.2 | update A's memory | 0 affected | TBD |
| 3.3 | delete A's memory | 0 affected | TBD |
| 3.4 | tenant_skills insert with mismatched installed_by | rejected | TBD |
| 3.5 | tenant_connectors with cross-tenant external_account_id | rejected (composite FK) | TBD |
| 3.6 | recommendations insert as member | rejected | TBD |
| 3.7 | webhook_dead_letters insert as member | rejected | TBD |

### §4 — Server-action probes

Try to invoke A's server actions via crafted POST requests while signed in as B.

| | Probe | Expected | Observed |
|---|---|---|---|
| 4.1 | POST to `/queue` accept action with A's proposal ID | server action returns "not found" / 404 (NOT 403) — `requireActor()` resolves B's tenant; the proposal lookup filters by tenant_id and finds nothing | TBD |
| 4.2 | POST to `/library/skills/uninstall` with A's tenant_skills.id | same | TBD |
| 4.3 | POST to `/library/connectors/<id>/sync` for A's connector | same | TBD |
| 4.4 | POST to `/settings/api-keys/revoke` with A's key ID | same | TBD |
| 4.5 | POST to `/settings/team/remove-member` targeting A's user | same | TBD |
| 4.6 | POST to `/settings/reset-demo-action` (if `BBC_HOSTED_DEMO_MODE=true`) | rejected by the W7-3 `tenant_slug === "demo-acme"` gate | TBD |

### §5 — MCP/API key probes

Generate an API key for tenant B at `/settings/api-keys`. Use it to hit the
MCP endpoint:

```bash
# 5.1 — list_memories: B's key, A's tenant
curl -H "Authorization: Bearer <B_KEY>" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_memories","arguments":{}}}' \
  https://staging.bbc.tools/api/mcp
# expected: only B's memories
```

| | Probe | Expected | Observed |
|---|---|---|---|
| 5.1 | list_memories with B's key | only B's rows | TBD |
| 5.2 | get_memory with A's memory ID | error / not_found | TBD |
| 5.3 | search_memories | only B's content | TBD |
| 5.4 | submit_memory (B has read-only scope) | scope-denied error | TBD |

### §6 — Service-role boundary

Verify that **no** route hands the service-role client through to user-controlled input.

Greppable checklist (run from `apps/dashboard`):

```bash
# any service-role client call sites
rg -n "adminClient\(\)|service_role" src/

# does any caller pass user-controlled args into RPC calls?
rg -n "rpc\(" src/ | head -30
```

Walk every hit. For each adminClient() call:

| | File:line | Args sourced from | Safe? |
|---|---|---|---|
| 6.1 | TBD (greppable) | TBD | TBD |

A safe pattern: `requireActor()` first, then `adminClient()` with `actor.user_id` / `actor.tenant_id` derived server-side.
An unsafe pattern: `adminClient()` then passing a request-body tenant_id verbatim into a query.

## Sign-off

When every probe row is the expected behavior:

| | |
|---|---|
| **Run date** | TBD |
| **Tester A** | TBD |
| **Tester B (attacker)** | TBD |
| **Branch / SHA** | TBD |
| **Decision** | ship / hold |

If `hold`, list the leaks below and link the fix commit(s):

| # | Leak | Fix commit | Re-verified |
|---|---|---|---|
| — | — | — | — |
