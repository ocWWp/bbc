# BBC v1.5 threat model

A STRIDE walk of the surfaces BBC exposes at v1.5. This is a forcing function, not a compliance artifact — each cell names a real mitigation or admits "TBD post-launch" and points at the work.

## Surfaces in scope

| # | Surface | What it does | Auth boundary |
|---|---|---|---|
| 1 | **Queue accept/reject** (`scripts/{accept,reject}.sh`, DB-mode RPCs `accept_proposal` / `reject_proposal`) | Promotes queued proposals into `memory_files` | File-mode: human at Main. DB-mode: `is_operator_of(tenant_id)` RLS gate per ADR-0012. |
| 2 | **Studio runs** (`apps/dashboard/src/app/studio/*`, server actions) | Renders role-shaped templates against the brain via an LLM provider | Authenticated tenant member (per-action `requireRole`), RLS scopes reads/writes to the member's tenant. |
| 3 | **MCP server** (`/api/mcp`) | Exposes brain content to MCP clients (Claude, Cursor, ChatGPT) | Per-tenant API key issued from `/settings/keys`. |
| 4 | **REST shim `/api/v1/brain/*`** (memories, decisions, vendors, search, proposals) | Programmatic read + propose against a tenant's brain | Per-tenant API key (same issuance as MCP). |
| 5 | **Connector ingest** (`/api/v1/webhooks/[tenant]/[webhook_id]`) | Receives Slack/Linear/GitHub events to enqueue proposals | Per-tenant webhook secret in URL/header. |
| 6 | **/settings/keys BYOK storage** | Stores user-supplied provider API keys (OpenAI, Anthropic, etc.) | Authenticated tenant admin only. |

Out of scope: third-party services (Supabase, Cloudflare, LLM providers) — those are reported upstream.

## STRIDE matrix

### 1. Queue accept/reject

| Threat | Today | Gap |
|---|---|---|
| **S**poofing | File-mode: filesystem ACLs + git history. DB-mode: Supabase JWT + `is_operator_of(tenant_id)` SQL function (ADR-0012, migration 0039). | None at v1.5. |
| **T**ampering | Accepted proposals move to `queue/_accepted/` (file-mode) or are immutable rows (DB-mode) — never deleted. | Git history alone for file-mode; relying on the operator not to force-push. Branch protection covers this on the OSS repo. |
| **R**epudiation | Every accept/reject writes the actor's id to `memory_files.last_modified_by` (DB-mode) or git commit author (file-mode). | None at v1.5. |
| **I**nformation disclosure | RLS scopes `memory_files` and `proposals` reads to the member's tenant. | None at v1.5. |
| **D**enial of service | Cloudflare rate-limit on `/api/*` (100 req/min per IP). Queue scripts are operator-local; no inbound surface. | If the queue grows unbounded (no max items, no size cap on body), a single noisy connector could fill it. TBD post-launch: per-tenant queue size cap + auto-stale GC. |
| **E**levation of privilege | RLS rejects non-operator writes; only `accept_proposal` / `reject_proposal` SQL functions can mutate the proposals table. Service-role key is server-only via `getSupabaseServiceClient` (Task 0h) and never reaches the client bundle. | None at v1.5. |

### 2. Studio runs

| Threat | Today | Gap |
|---|---|---|
| **S**poofing | Supabase JWT + `requireActor` + `requireRole` on every server action. `Actor.templateSlug` (Task 0b) carries the user's role for nav/route gating. | None at v1.5. |
| **T**ampering | `studio_runs` rows are append-only from the user side; overrides land in `studio_template_overrides` with `active=false` for soft delete. | TBD post-launch: tighten member-level Studio action gates to operator (the request flows succeed for member auth but RLS rejects the writeback; explicit gate would surface a clearer error — noted in handoff). |
| **R**epudiation | `studio_runs.created_by = auth.uid()` enforced by RLS. Override rows carry `created_by` too. | None at v1.5. |
| **I**nformation disclosure | Templates bundle the brain into the LLM prompt — the LLM provider sees brain content. Mitigated by: BYOK keys (provider is whoever the tenant chose), no third-party logging by us. Cross-tenant exposure blocked by RLS on `memory_files` reads inside the template renderer. | If a tenant chose a provider that retains prompts (e.g., OpenAI training-default-on), brain content leaks to that vendor. Documented in `apps/dashboard/src/app/settings/keys` UI. TBD post-launch: per-provider retention guidance. |
| **D**enial of service | Rate-limit on `/api/*` indirectly covers Studio action POSTs. Studio runs are cheap (one LLM call per template); no concurrent-run cap today. | TBD post-launch: per-tenant daily run cap to bound BYOK provider cost + abuse. |
| **E**levation of privilege | `requireRole('member')` on read-only Studio routes; `requireRole('operator')` on writebacks. Service-role key not reachable from client. | None at v1.5. |

### 3. MCP server (`/api/mcp`)

| Threat | Today | Gap |
|---|---|---|
| **S**poofing | Per-tenant API key (one secret per tenant, regenerable from `/settings/keys`). Key prefix maps to tenant_id; verifier hits Supabase. | None at v1.5, but key prefix is publicly visible — bearer auth alone, no mutual TLS, no IP allowlist. Self-hosters can layer either via Cloudflare. |
| **T**ampering | MCP server is read-only at v1.5; writes go through the queue path which has its own gate. | None at v1.5. |
| **R**epudiation | API key id is logged on every request. | TBD post-launch: structured audit log surfaced in `/settings/log` for MCP request history. |
| **I**nformation disclosure | RLS gates every read to the key's tenant. Key is opaque (no info in the token). | None at v1.5 beyond the inherent "MCP client sees brain" — that's the product. |
| **D**enial of service | Cloudflare rate-limit per IP (200 req/min on `mcp.bbc.tools` — see `cloudflare-waf.md`). | No per-key rate limit yet — a single tenant with a leaked key gets DOSed up to the IP limit. TBD post-launch. |
| **E**levation of privilege | Key cannot escape its tenant (RLS); cannot mutate (read-only at v1.5). | None at v1.5. |

### 4. REST shim `/api/v1/brain/*`

Same threat profile as MCP — same key issuance, same RLS, same Cloudflare rate limit. Two extra notes:

- The `/api/v1/brain/proposals` POST path is the **only** write surface for API-key holders. It enqueues, never accepts; the queue gate still requires an operator. This is intentional: external automation can propose, only humans accept.
- `/api/v1/brain/search` is the highest-bandwidth endpoint and the most likely DoS target. Per-key rate limit is the most useful post-launch addition.

### 5. Connector ingest (`/api/v1/webhooks/[tenant]/[webhook_id]`)

| Threat | Today | Gap |
|---|---|---|
| **S**poofing | Per-webhook secret in `ingestion_sources` (ADR-0005). Signature verified against the secret on each request. | None at v1.5. |
| **T**ampering | Replay protection via the connector's own nonce/timestamp (Slack `X-Slack-Request-Timestamp`, GitHub `X-Hub-Signature-256`, Linear webhook signature). | Not all connectors check timestamps yet — TBD post-launch sweep. |
| **R**epudiation | Each webhook write logs `ingestion_sources.id` on the resulting `memory_files` row. | None at v1.5. |
| **I**nformation disclosure | RLS scopes the resulting memory row to the tenant. Webhook URL contains tenant_id but no brain content. | URL leakage exposes the tenant_id (not the brain). Acceptable; tenant_id alone proves no access. |
| **D**enial of service | Cloudflare rate-limit per IP (100 req/min on `/api/*`). | No per-webhook-secret rate limit — a single noisy upstream connector fills the queue. TBD post-launch (same fix as queue size cap). |
| **E**levation of privilege | Webhook can only enqueue, not accept. | None at v1.5. |

### 6. /settings/keys BYOK storage

| Threat | Today | Gap |
|---|---|---|
| **S**poofing | `requireRole('admin')` on the key-management actions. RLS gates `tenant_provider_keys` rows. | None at v1.5. |
| **T**ampering | Soft-delete only (active flag). Audit log row on every change. | None at v1.5. |
| **R**epudiation | Key changes logged with actor id. | None at v1.5. |
| **I**nformation disclosure | Keys stored encrypted at rest (Supabase column encryption). Decrypted server-side only, never returned to the client after creation. | Service-role bypasses RLS; mitigated by `getSupabaseServiceClient` being a server-only module (Task 0h). Static analysis (Semgrep) should catch accidental client-side imports — verify the rule fires when the launch checklist runs Semgrep on a probe commit. |
| **D**enial of service | Cloudflare rate-limit per IP on `/api/*`. Key management UI is admin-only and infrequent. | None at v1.5. |
| **E**levation of privilege | RLS + role gate. Cross-tenant access blocked at the row level. | None at v1.5. |

## Cross-cutting controls

- **Cloudflare WAF + rate limiting** (see `cloudflare-waf.md`) — sits in front of every surface above.
- **Supabase RLS** — every tenant-scoped table has a default-deny policy; access is granted only via explicit `is_member_of` / `is_operator_of` / `is_admin_of` checks. Tested by the `test/rls/` suite.
- **Service-role key isolation** — `getSupabaseServiceClient` (Task 0h) is a server-only module that uses `'server-only'` to fail the build if imported from a client component. Required for cross-user inbox writes (Task 30) without leaking the key.
- **Disclosure** — `SECURITY.md` + `.well-known/security.txt`, 72h ack target, 90-day coordinated disclosure.

## Post-launch backlog (collected here, not re-listed elsewhere)

1. Per-tenant queue size cap + auto-stale GC.
2. Tighten member-level Studio action gates to operator (cosmetic; RLS already rejects).
3. Structured audit log surfaced in `/settings/log` for MCP + REST requests.
4. Per-API-key rate limit (currently only per-IP).
5. Webhook timestamp/nonce sweep across all connectors.
6. Per-tenant daily Studio run cap.
7. Semgrep custom rule asserting `getSupabaseServiceClient` is not imported outside server boundaries.

This list is the input for any v1.6 hardening pass.
