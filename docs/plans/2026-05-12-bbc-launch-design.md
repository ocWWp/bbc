# BBC v1.5 launch — design doc

**Status:** v2 — revised 2026-05-12 after codex BLOCK review; ready to plan
**Branch:** `phase-j-marketing-studio` (PR #1, 81 commits ahead of main as of 83d1052)
**Target ship:** late June / early July 2026 (~7 weeks from 2026-05-12)
**Authors:** ocwwp + Claude (revised after codex adversarial review)
**Supersedes:** the implicit "merge PR #1 and ship" plan in `.planning/ROADMAP.md` §"What's next, in order"

## Revision history

- **v1** (commit `83d1052`): initial design from brainstorm.
- **v2** (this revision): rewrote after codex review surfaced 22 issues. Major changes:
  - Cross-tenant Loop 3 → deferred to v1.1 (privacy ADR + k-anonymity infra not 2-week work)
  - SKILL.md mapping → concrete `metadata.bbc.*` extension with strict validation, hand-ported built-ins, NOT generic ecosystem import
  - Dynamic `/studio/{role}/{skill-id}` → deferred to v1.1; v1.5 skills slot into the existing 5 studio surfaces as additional templates
  - Reuse `external_accounts` (already in `migrations/0025`) for OAuth tokens, not a new column
  - Added prompt-injection sandboxing strategy for imported skill bodies
  - Added recommendation spam controls (dedupe, cooldown, dismissible)
  - Added URL-import + webhook security details (SSRF allowlist, signature verification, size limits)
  - Added connector framework operational requirements (token refresh, rate limits, pagination cursors, idempotency)
  - Library design integration moves to week 1–2 BEFORE implementation (was week 7)
  - Timeline: 9 weeks → 7 weeks (cross-tenant Loop 3 removal saves 2 weeks)

## Why this doc exists

The roadmap as written had BBC v1 shipping immediately after PR #1 merge. A brainstorm on 2026-05-12 expanded scope into a v1.5 launch with a unified Library, an external skill-import path, a connector framework, and a Loop 3 v1 recommendation surface. A codex adversarial review found 22 issues; this revision addresses them. The result still positions BBC as **the open ecosystem-consuming company brain**, but with scope honest about operational complexity.

This doc captures the design. Implementation planning happens in a follow-up (executed by the `writing-plans` skill).

## §1 — Positioning & scope

### One-line pitch
**"BBC is the open company brain. Typed memory × any agent skill × any connector. AGPL, self-host, BYOK."**

### Three pillars
1. **Memory** — typed, queryable, human-reviewed (Loop 1, shipped). 9 supertags + relations.
2. **Skills** — role-scoped agents. 5 hand-ported built-in skills + a controlled SKILL.md-with-`metadata.bbc.*`-extension import path. NOT generic ecosystem import.
3. **Connectors** — typed-aware data ingestion. 6 at launch (Notion, GitHub, Linear, Webhook, Gmail, Drive) + MCP framing. Slack moves to v1.1 to avoid coupling launch to its OAuth-review timeline.

### Loop 3 v1 at launch (single-tenant only)
- **Single-tenant recommendations**: rule-based proposals of skills/connectors matched against tenant profile + memory gaps
- **Recommendation spam controls** (added in v2): dedupe by `(tenant, item_id)`, 14-day cooldown after dismissal, max-per-tenant of 5 active recommendations
- **NOT cross-tenant signal** — deferred to v1.1 with its own privacy ADR

### Audience
**Startup founders + indie hackers.** Hosted demo URL = foot in the door. Self-host link = conversion. Launch post lives at the intersection of "OSS / self-host / BYOK" (indie hooks) and "structure your startup's work" (founder hooks).

### Out of scope for v1.5 (deferred to v1.1+)
- **Cross-tenant Loop 3 signal** ("companies your size typically have X") — deferred to v1.1. Needs:
  - Privacy ADR (k-anonymity ≥5, opt-in, no raw bodies cross-tenant, deletion/export semantics, audit logs) — multi-week, not 3-day
  - Cohort definition with churn handling for k dropping below 5
  - GDPR-aligned deletion + export
- **Dynamic studio routes** (auto-generated `/studio/{role}/{skill-id}` from arbitrary imports) — deferred. v1.5 skills slot into the existing 5 studio surfaces as additional templates in those role's template lists; no new routes
- **Generic ecosystem SKILL.md import** (anthropics/skills, anywhere) — deferred. v1.5 imports SKILL.md only if it ALSO carries the `metadata.bbc.*` extension fields BBC requires; this is a strict validator, not a translator
- **Hybrid retrieval / vector search** — deferred until tenants hit ~5K items; current brain-summary handles v1.5
- **Self-modifying core** (BBC-on-BBC PRs from Sentry/Linear watchers)
- **Slack connector** — moves to v1.1; app review process incompatible with a 7-week deterministic ship date
- **Daily-scan cadence** + 3-proposals-per-day cap from ADR-0009
- **Real-time team chat in BBC** (MCP framing covers the value)
- **`.claude/agents/*.md` import** — explicitly NOT in scope; per `apps/dashboard/CLAUDE.md` and Main `CLAUDE.md`, those files are skill definitions for a different AI system and reading them is forbidden

## §2 — Library (the unified marketplace UX)

### Route
- `/marketplace` → 308 redirect to `/library`
- `/library` is the new home for browsing extensibility

### Three categories
| Category | Content | State today |
|---|---|---|
| **Skills** | Agent role templates. 5 hand-ported built-ins + import-from-URL (validating `metadata.bbc.*` extension) | NEW for launch |
| **Connectors** | Typed-aware data ingestion adapters | NEW for launch |
| **Providers** | LLM / DB / email / hosting vendors. Current `/marketplace` content | Shipped; moves under this tab |

### "Recommended for you" surface (Loop 3 v1)
- Top band on `/library`, above the categories
- Algorithm v1: deterministic rule-based, no LLM
  - **Skill recommendations**: match new built-in/curated skills against tenant's role profile (`memory/ops/profiles/*.yaml`)
  - **Connector recommendations**: triggered by detected memory gaps (e.g., 5+ decisions but no GitHub connector → suggest GitHub)
  - **Tool/provider recommendations**: from `memory/ops/providers/*.yaml` based on which roles the tenant uses
- Each recommendation = queue proposal + Library surface card + "Why this?" explanation
- **Spam controls** (new in v2): dedupe by `(tenant_id, recommendation_target_id)`; 14-day cooldown after dismissal; max 5 active recommendations per tenant; dismissed recommendations persist as "snoozed", restored after cooldown
- **NOT cross-tenant signal** — explicitly out of v1.5 scope per §1

### Library design integration — moved to week 1–2
Per codex review: building the Library surface in weeks 2–6 with design integration in week 7 guarantees rework. New sequencing:
- **Week 1**: User runs the Claude Design prompt (`docs/plans/2026-05-12-library-claude-design-prompt.md`) externally, brings the result back
- **Week 2**: Claude Design output reviewed + applied to the Library route as the canonical design; subsequent implementation builds against this design from day 1

If the Claude Design output is not ready by end of week 1, week 2 work shifts: design comes back; implementation starts week 3 with a 1-week delay accepted.

### Card and detail-surface requirements
Captured in detail in the separate Claude Design prompt at `docs/plans/2026-05-12-library-claude-design-prompt.md`. Non-visual requirements:
- Typed-schema mapping on every card (Skills: "Reads: voice, product, decision"; Connectors: "Writes: decision, vendor, note")
- Search-first; category filter; "Installed" pill; "Recommended" badge
- Detail drawer/modal/page shows source repo, license, last updated, `firstUseInputs` preview, OAuth scope summary, install button with permission preview
- Mobile-first: card grid collapses, detail surface becomes full-screen sheet
- Keyboard-navigable; Escape dismisses detail; search input first-focusable

### Simplicity + user segmentation
The Library serves two audiences with different needs:
- **Founders / curated path** (default): "What should I install today?" → 3–5 curated recommendations visible without scroll, starter packs
- **Indie hackers / power-user path**: full control, density, URL import easy to reach

One UI, two effective experiences. Solve via information-density gradient: simple-by-default at the top, increasing density as the user scrolls or expands sections.

## §3 — Skills layer

### Format decision: SKILL.md + strict `metadata.bbc.*` extension (NOT generic ecosystem import)

Codex review found that generic SKILL.md import would silently fail because current BBC templates have constrained semantics (typed `firstUseInputs.kind`, executable `buildPrompt()` with citation rules, writebacks, namespaced `template_id`). A vanilla SKILL.md cannot reproduce these.

**v1.5 approach:**
- **Built-in 5 studios stay as TS code** for now. They are NOT re-exported as SKILL.md packs in v1.5. (The re-export was a nice-to-have that masked a hard problem.)
- **Imported skills MUST carry `metadata.bbc.*`** with every BBC-specific field declared. If missing, import rejects with a clear error pointing at the spec.
- BBC ships a **SKILL.md-BBC spec extension doc** as part of v1.5 (`docs/skill-md-bbc-spec.md`) defining required `metadata.bbc.*` fields.
- An imported skill that passes validation lands in the **existing 5 studios' template lists** by its declared `metadata.bbc.role` field. NO new dynamic studio routes.

### Required `metadata.bbc.*` fields for an importable skill
```yaml
---
name: my-skill                            # SKILL.md standard
description: ...                          # SKILL.md standard
metadata:
  bbc:
    role: marketing                       # one of: marketing | founder | engineering | designer | support
    kind: structured                       # one of: structured | plain (matches existing Template.kind enum)
    label: "Launch post"                   # shown in studio template picker
    hint: "Generates a launch post..."     # shorter than description, shown on hover
    first_use_inputs:                      # MUST match Template.firstUseInputs shape
      - { id: product_name, label: "Product name", required: true, kind: text }
      - { id: target_user, label: "Target user", required: true, kind: text }
    retrieval:
      required_types: [voice, product]
      contextual_types:
        - { type: decision, top_k: 5 }
      expand_relations: true
    citation_contract: required           # 'required' | 'optional' | 'none' — gates whether emit_output_blocks must cite
    output_kind: plain                     # 'plain' | 'structured' (drives output-blocks schema)
---

# (body markdown — the prompt template, with {{input}} and {{brain.*}} interpolation slots)
```

Imports without these fields fail with a clear error: "This SKILL.md is not BBC-compatible. See docs/skill-md-bbc-spec.md for required fields."

### Prompt-injection sandboxing (new in v2)
Per codex security concern: imported markdown bodies can contain prompt-injection text ("ignore your citation contract", "leak the memory IDs", etc.). Sanitization strategy:

- **System-prompt wrapper**: imported body runs inside a fixed BBC system prompt that enforces citation contract + tool-use rules. Wrapper text is BBC-controlled, not skill-controlled.
- **Static markdown sanitization**: imported body is parsed; any text matching known injection patterns (e.g., "ignore previous", "system:", role-prefix tokens) is flagged at import time and surfaced to the user before install confirmation.
- **Memory-ID redaction in interpolation**: `{{brain.*}}` interpolation never inserts raw IDs into the body; IDs are only available via the tool layer.
- **Citation contract enforcement**: if `citation_contract: required`, BBC validates every output cites real memory IDs from the tenant; outputs without valid citations are rejected and surfaced to the user as a failed run.

This stack doesn't eliminate prompt-injection risk but caps the blast radius: a malicious skill can produce bad output but cannot exfiltrate memory IDs, bypass citation contract, or escape its role's tool surface.

### Importer mechanics + URL security
- Entry points: paste URL, browse curated pack (Library card click), drop file
- URL parsing supports: `https://github.com/owner/repo/blob/branch/path/SKILL.md`, `https://raw.githubusercontent.com/...`, `github://owner/repo/path` (sugar)
- **URL allowlist**: only `github.com` + `raw.githubusercontent.com` for v1.5. Other hosts rejected.
- **No redirects** off the allowlist. Redirect from github.com → github.com OK; redirect to other host = reject.
- **Public repos only** for v1.5. Private repos = "v1.1 feature".
- **Size limits**: SKILL.md body ≤ 256KB; total skill directory ≤ 1MB.
- **Rate limit handling**: anonymous GitHub API. On 429, surface "GitHub rate-limited; try again in N minutes" with retry-after parsed from header.
- **No script execution** in v1.5. `scripts/` directory ignored entirely.
- **No transitive fetch**. Skill cannot reference external assets that BBC re-fetches.

### Schema: `tenant_skills` with full ops fields
```sql
create table public.tenant_skills (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  source_kind     text not null check (source_kind in ('builtin', 'github', 'manual')),
  source_url      text,
  source_commit   text,                   -- git SHA at install time, for reproducibility
  skill_name      text not null,
  skill_role      text not null check (skill_role in ('marketing', 'founder', 'engineering', 'designer', 'support')),
  manifest        jsonb not null,         -- parsed frontmatter (full)
  body            text not null,
  body_hash       text not null,          -- sha256(body), for change detection on re-fetch
  installed_at    timestamptz not null default now(),
  installed_by    uuid not null references auth.users(id),
  uninstalled_at  timestamptz,            -- soft delete
  active          boolean not null generated always as (uninstalled_at is null) stored,
  unique (tenant_id, skill_name) where active
);

alter table public.tenant_skills enable row level security;

create policy tenant_skills_member_read on public.tenant_skills
  for select using (public.is_member_of(tenant_id));

create policy tenant_skills_admin_insert on public.tenant_skills
  for insert with check (public.is_member_of(tenant_id) and public.is_admin_of(tenant_id) and installed_by = auth.uid());

create policy tenant_skills_admin_update on public.tenant_skills
  for update using (public.is_member_of(tenant_id) and public.is_admin_of(tenant_id));

create index tenant_skills_role_idx on public.tenant_skills (tenant_id, skill_role) where active;
```

Versioning: on re-import of the same `skill_name`, if `source_commit` differs, the new install soft-deletes the old (sets `uninstalled_at`) and inserts a new row. History preserved.

## §4 — Connectors layer

### Connector interface
```typescript
interface Connector {
  id: string                                        // 'notion', 'github', 'linear', 'webhook-generic', 'gmail', 'drive', 'discord'
  name: string
  description: string
  writes_to: SupertagType[]
  oauth_scopes?: string[]
  permission_summary: string
  
  authenticate(tenant_id, redirect_url): Promise<AuthURL>
  complete_auth(tenant_id, code): Promise<{ external_account_id: string }>   // stores token in external_accounts
  refresh_token?(external_account_id): Promise<void>                          // OAuth-2-PKCE flow uses this
  
  sync(tenant_id, external_account_id, cursor?: SyncCursor): AsyncIterator<MemoryProposal>
  sync_schedule: 'on_demand' | { interval_minutes: number }
  
  // operational
  max_proposals_per_sync: number          // hard cap to prevent queue spam from initial sync
  rate_limit_strategy: RateLimitStrategy   // exponential-backoff config per provider
}
```

A connector emits **MemoryProposals**, never direct writes. Every proposal lands in `/queue` for human review. Preserves CLAUDE.md non-negotiable #6 (no silent autonomy).

### OAuth storage — reuse `external_accounts` (codex correction)
Per migration `0025_external_accounts.sql`, BBC already has `external_accounts` with AES-256-GCM encryption, RLS, and explicit support for "a future OAuth refresh token from Notion / GitHub / Linear". v1.5 reuses this table:
- `external_accounts.provider_id` = the connector's id (e.g., `notion`, `github`)
- `external_accounts.kind` = `oauth_token`
- `external_accounts.secret_ciphertext` = encrypted OAuth refresh token JSON
- Per-tenant unique active row enforced by existing `external_accounts_active_unique_idx`

`tenant_connectors` (new table) holds only connector configuration + sync state, NOT credentials.

### Launch tier (6 connectors + MCP framing, NOT 8)
Codex flagged sloppy counting. Real count:

| # | Connector | Writes to | Effort | OAuth review risk |
|---|---|---|---|---|
| 1 | **Notion** | `note`, `decision`, `glossary`, `product` | 3d | Low (Notion is permissive) |
| 2 | **GitHub** | `decision` (ADRs), `note` (PRs), `team`, `source_artifact` | 2d | None (use personal access tokens) |
| 3 | **Linear** | `decision`, `note`, `product` (cycles/projects) | 2d | Low |
| 4 | **Generic Webhook** | configurable; default `note` | 2d (was 1d — codex's security additions) | None |
| 5 | **Gmail** | `note` (threads), `decision` (search-pinned), `team` (contacts) | 4d | **HIGH — Google verification** |
| 6 | **Drive** | `note` (docs), `source_artifact` (files) | 3d | **HIGH — Google verification (shared OAuth flow w/ Gmail)** |

**Plus MCP inbound positioning** (no new code): "BBC remembers what you tell Claude" — the existing MCP server makes Claude conversations leave memory traces; counted as the implicit 7th source but not built into Library as a connector card.

### Dropped from launch (codex feedback)
- **Slack** — Slack app-review process incompatible with deterministic ship; moves to v1.1. Submit app for review during launch week so it's ready in v1.1.
- **Discord** — moves to v1.2; less critical than Slack and adds OAuth surface area we don't need to debug in launch.

### Connector framework operational requirements (added in v2 per codex)
- **Token refresh**: built into the framework; called automatically before sync if token expiry < 24h. Failed refresh → connector marked `last_sync_status = 'auth_expired'` and surfaced in Library card.
- **Rate limit awareness**: per-connector backoff. On 429 / quota-exceeded, exponential backoff with jitter; sync state captures `next_retry_at`.
- **Pagination cursors**: `sync_state.cursor` is the per-connector pagination token. Connectors that don't paginate (small workspaces) use a single sentinel.
- **Idempotency**: every proposal carries a `source_ref` (provider's stable ID for the item). Memory proposals dedupe on `(tenant_id, source_ref)` — re-syncing the same Notion page does not create duplicate proposals.
- **Partial failure**: if sync emits 100 proposals and then errors, the 100 are committed to the queue; sync state records the cursor at the failure point; user retries from there. No all-or-nothing semantics.
- **Backfill cap**: first sync limited to `max_proposals_per_sync` (default 200) to prevent queue spam. User can re-trigger backfill in the connector settings for more.
- **Duplicate suppression**: re-running first sync after some proposals are accepted: queue proposals' `source_ref` is compared against existing `memory_files.fields.source_ref`; matches are skipped.

### Trust-through-preview first-sync flow
1. Click Install → OAuth via the connector's `authenticate()` → token stored in `external_accounts`
2. BBC fetches a **sample** (10 items) using the connector's preview hook
3. **Preview surface**: shows the typed-memory rows BBC would create
4. User confirms → full sync runs, capped at `max_proposals_per_sync`
5. Proposals land in `/queue` for review
6. User can re-trigger backfill if they want more

### Source → supertag mapping
Every connector ships with an explicit mapping declared in its manifest. Shown on the install drawer. Example for Notion:
```
Notion page property `type: decision`  →  memory_files where type='decision'
Notion page with no `type` property    →  memory_files where type='note'
Notion property `Title`                 →  memory_files.title
Notion property `Date`                  →  memory_files.fields.decision_date
Notion blocks (markdown)                →  memory_files.body
```
Users can override the mapping before first sync (advanced).

### Generic Webhook security (added in v2 per codex)
- Each tenant + webhook gets a unique URL: `https://{instance}/api/v1/webhooks/{tenant}/{webhook_id}`
- **HMAC signature verification**: each webhook gets a tenant-rotatable secret. Incoming requests must include `X-BBC-Signature: sha256=<hmac>` header where the body is HMAC-SHA256 with the secret. Mismatched signature → 401.
- **Replay protection**: webhooks include a 5-minute timestamp window. Requests older than 5 min → 401.
- **Payload size limit**: 1MB. Larger → 413.
- **Mapping**: user defines JSONPath-style mapping in the install drawer ("Field `X` → `title`, field `Y` → `body`, set type = `note`"). Read-only evaluation; no scripts, no eval.
- **Dead-letter queue**: malformed JSON, mapping-rejected payloads, missing required fields → captured in `webhook_dead_letters` table for user inspection.
- **Throttling**: per-tenant rate limit (default 60 req/min); 429 with retry-after on overflow.

### Schema: `tenant_connectors` (state + config only; credentials live in `external_accounts`)
```sql
create table public.tenant_connectors (
  id                       uuid primary key default gen_random_uuid(),
  tenant_id                uuid not null references public.tenants(id) on delete cascade,
  connector_id             text not null,
  external_account_id      uuid references public.external_accounts(id) on delete restrict,   -- NULL for webhook-generic
  mapping                  jsonb not null default '{}'::jsonb,
  sync_state               jsonb not null default '{}'::jsonb,
  webhook_secret_ciphertext bytea,                       -- only for webhook-generic; encrypted
  webhook_secret_iv         bytea,
  webhook_secret_tag        bytea,
  last_sync_at             timestamptz,
  last_sync_status         text check (last_sync_status in ('ok', 'error', 'partial', 'auth_expired', 'rate_limited')),
  last_sync_error          text,
  active                   boolean not null default true,
  installed_at             timestamptz not null default now(),
  installed_by             uuid not null references auth.users(id),
  uninstalled_at           timestamptz,
  unique (tenant_id, connector_id) where active
);

alter table public.tenant_connectors enable row level security;
-- RLS: member read, admin insert/update only (matches tenant_skills pattern)
```

Plus `webhook_dead_letters` for malformed-payload capture.

## §5 — Retrieval (declaration stored, behavior unchanged) + Loop 3

### Retrieval — what v1.5 actually does (clarified per codex)

Codex flagged that the original draft claimed "no retrieval system change" while also adding template-declared retrieval. Honest version:

- **v1.5 STORES** the `retrieval` declaration in the imported skill's manifest
- **v1.5 BEHAVIOR is unchanged**: `brain-summary.ts` still loads top-200 recent memories with the current hard-coded type-bucketed slice (1 voice, 1 product, 5 decisions, 8 vendors, 8 team, 12 glossary)
- **v1.5.1 (post-launch)** begins HONORING the declaration: for skills with `required_types` declared, load full rows of those types (no slice). For `contextual_types` with `top_k`, ignore in v1.5.1, activate in v1.6 when hybrid retrieval ships.

This is true forward-compatibility: the storage layer changes, the inference behavior does not. No token-budget surprises at launch.

**Note on prompt caching:** the original draft cited Anthropic prompt caching as a cost-saver. Codex correctly noted this is not currently wired in the studio actions. Adding `cache_control` to the brain-summary block in studio actions is a 1-day item; we add it to **week 2** of the timeline rather than claim it as already-given.

### When to graduate (post-launch, v1.6+)
- **v1.6 (when tenants approach 5K items or recall@10 measurably drops):** add hybrid Postgres (tsvector + pgvector + RRF in one SQL CTE). Embedding model: EmbeddingGemma-300M via Ollama. New ADR (ADR-0010 retrieval).
- **v1.7+ (when ~50K items):** cross-encoder reranker (`bge-reranker-v2-m3`) + pgvectorscale (DiskANN).

### Loop 3 v1 at launch (single-tenant only)

In scope:
- **Recommendation surface** in Library top band (the "Recommended for you" carousel from §2)
- **Recommendation algorithm v1** — pure rule-based, no LLM:
  - **Skill recommendations**: new built-in/curated skills matched against tenant's role profile
  - **Connector recommendations**: triggered by detected memory gaps (rules in `lib/loop3/recommend-connector.ts`)
  - **Tool/provider recommendations**: based on declared roles
- Each recommendation surfaces in the Library AND creates a queue proposal (audit trail)
- "Why this?" explanation backed by observed counts (e.g., "Your tenant has 5 decision-type memories. GitHub typically captures ADRs that BBC could pull as decisions automatically.")

**Spam controls (new in v2):**
- `recommended_items` table tracks `(tenant_id, item_id, item_kind, recommended_at, dismissed_at, install_at)`
- Dedupe: same `(tenant_id, item_id)` never recommended twice in a 14-day window after dismissal
- Cooldown: dismissed recommendations restore as available after 14 days
- Max: at most 5 active recommendations per tenant at any time; new ones bump oldest dismissed entries

**Out of scope for v1.5 Loop 3 (deferred to v1.1):**
- Cross-tenant signal entirely (privacy ADR + k-anonymity + cohort churn + GDPR)
- Self-modifying core
- Daily-scan cadence
- LLM-in-the-loop recommendations

## §6 — Timeline (7 weeks)

| Week | Theme | Deliverables |
|---|---|---|
| **1** | Foundation + Library design | PR #1 merged to main. `/graph` deleted. `/marketplace` → `/library` route rename + 308 redirect. Schema migrations: `tenant_skills`, `tenant_connectors`, `recommended_items`, `webhook_dead_letters` (with RLS). Cloudflare deploy verified end-to-end. ADR-0010 (retrieval, forward-only) drafted. **User runs Claude Design prompt externally; design output captured.** |
| **2** | Skills layer + prompt caching | SKILL.md-BBC spec doc published (`docs/skill-md-bbc-spec.md`). Strict-validator parser. Import-from-URL flow with security controls (allowlist, size limit, rate-limit UX). Prompt-injection sandbox wrapper. **Add Anthropic prompt caching to brain-summary block** in studio actions. Library Skills tab functional. Apply Claude Design output. |
| **3** | Connector framework + 3 connectors | Connector framework with token refresh, rate limits, pagination cursors, idempotency, partial-failure handling. Notion + GitHub + Generic Webhook (with HMAC signature verification, dead-letter queue, replay protection, size limits, throttling). Trust-through-preview first-sync flow. |
| **4** | More connectors + Loop 3 v1 | Linear + Gmail + Drive (Google verification submitted week 1). Loop 3 single-tenant recommendation algorithm + Library "Recommended for you" surface with spam controls (dedupe, cooldown, dismiss). |
| **5** | Dogfood + polish | Demo tenant fixture pre-seeded (fictional startup with 50+ memories across 6+ types). End-to-end dogfood: signup → install skill → install connector → run studio → review queue → dismiss/install recommendations. Connector edge cases (token refresh, rate limit, partial sync). |
| **6** | Landing + launch post + docs | Landing page copy refresh for three pillars + Loop 3 tease + "cross-tenant signal coming v1.1" forward-looking line. Launch post draft (HN + Twitter + blog). Mintlify docs: SKILL.md-BBC spec, building connectors, importing skills, self-host. Demo polish. Slack app submitted (lands in v1.1). |
| **7** | Buffer + launch | Buffer week. Final bug bash. Type-check + lint clean. Test coverage pass. Public launch. |

**Realistic ship: ~7 weeks from 2026-05-12 = ~2026-07-01 (early July 2026).**

## §7 — Risks tracked (expanded per codex)

| Risk | Mitigation |
|---|---|
| **Prompt injection via imported SKILL.md bodies** | System-prompt wrapper that BBC controls; static markdown sanitization at import; memory-ID redaction in interpolation; citation contract enforcement. Caps blast radius without eliminating risk. |
| **OAuth token refresh failures** (Notion / GitHub / Linear / Google) | Framework refreshes before sync if expiry <24h. Failed refresh → `last_sync_status = 'auth_expired'` surfaced in Library card with re-auth CTA. |
| **Connector idempotency** (duplicate proposals on re-sync) | `source_ref` carried on every proposal; dedupe on `(tenant_id, source_ref)` against existing `memory_files.fields.source_ref`. |
| **RLS gaps on new tables** | All new tables (`tenant_skills`, `tenant_connectors`, `recommended_items`, `webhook_dead_letters`) ship with RLS enabled and member-read / admin-write policies copied from the `external_accounts` pattern. |
| **Recommendation spam** | Dedupe by `(tenant_id, item_id)`, 14-day cooldown after dismiss, max 5 active per tenant. Codex flagged this — was missing in v1. |
| **Dynamic studio runtime complexity** | Deferred to v1.1. v1.5 skills slot into existing 5 hardcoded studio surfaces; no new routes. |
| **Google verification timeline** (Gmail + Drive) | Submit week 1. If verification not granted by week 6, ship those connectors with "unverified app" warning to demo-tenant users only; full release as v1.5.1 once verified. |
| **Library implementation before design** | Codex flagged in v1 — fixed by moving design pass to week 1, implementation against design starts week 2. |
| **Cross-tenant Loop 3 privacy** | Out of scope for v1.5. v1.1 addresses with explicit ADR. |
| **Slack OAuth review timeline** | Deferred to v1.1; submit app week 6 to be ready for v1.1. |
| **Webhook abuse / spam** | HMAC signature verification, 5-min replay window, 1MB size limit, 60 req/min per tenant. |
| **SKILL.md ecosystem adoption claim** | v1.5 doesn't depend on the ecosystem being adopted; v1.5 imports only SKILL.md-BBC (our extension). Future v1.x can broaden. |
| **Demo tenant feels fake** | Dogfood week 5 with 50+ memories across 6+ types; run every studio and every connector to verify output quality. |
| **Branch divergence from main** | Merge PR #1 to main week 1; subsequent work happens on `main` or short-lived feature branches. |
| **Scope creep** | This doc + writing-plans output are the gate. Amendments require explicit doc revision + scope decision. |

## §8 — Launch-day artifacts

1. **Hosted demo URL** — pre-seeded fictional startup brain. Runs fast. "Reset demo" button.
2. **AGPL OSS GitHub repo** — public, README + LICENSE + quickstart.
3. **Landing page** — refreshed copy: three pillars + Loop 3 v1 + "cross-tenant signal coming v1.1" tease.
4. **Mintlify docs** — self-host, BYOK, SKILL.md-BBC spec, importing skills, building connectors.
5. **Launch post** — HN top-level + Twitter thread + blog post.
6. **30-second demo video** — signup → install Notion connector → run Marketing studio → cited output.
7. **30-second skill-import demo** — paste github URL → BBC validates SKILL.md-BBC frontmatter → skill installed → run from /studio.

## Open items handed off to writing-plans

- Per-week deliverables as task lists with explicit acceptance criteria
- Per-deliverable dependency graph
- Branch + commit cadence (merge PR #1 first, then short-lived branches)
- Test plan per major surface (especially: prompt-injection vectors on imported SKILL.md, webhook signature verification, token refresh failure)
- Migration plan + RLS verification for the four new tables
- ADR drafts: ADR-0010-retrieval (forward-only), ADR-0010-skill-md-bbc (spec)
- Loop 3 spam-control implementation (the dedupe + cooldown + max logic)
- Google verification submission for Gmail + Drive (week 1 task)

## Appendix — Companion artifacts produced this session

- `docs/plans/2026-05-12-library-claude-design-prompt.md` — product-requirements prompt for Claude Design (UX-only)
- This doc — `docs/plans/2026-05-12-bbc-launch-design.md` (v2 after codex review)

## Related references

- Vision memory: `~/.claude/projects/-Users-ocwwp-Desktop-BB-C/memory/project_bbc_full_vision.md`
- ADR-0008: `memory/decisions/0008-three-loop-architecture.md`
- ADR-0009: `memory/decisions/0009-loop-3-scope.md` (single-tenant only in v1)
- Roadmap: `.planning/ROADMAP.md`
- Main CLAUDE.md: `/CLAUDE.md` (precedence rules)
- Dashboard CLAUDE.md: `apps/dashboard/CLAUDE.md`
- Existing migration: `apps/dashboard/supabase/migrations/0025_external_accounts.sql` (reused for OAuth tokens)
- Codex review session: `019e1e8c-4ab6-7f50-ba40-614aa5e97fd9` (2026-05-12, BLOCK verdict; this doc is the response)
