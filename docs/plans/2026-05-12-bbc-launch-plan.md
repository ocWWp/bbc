# BBC v1.5 launch — implementation plan

**Status:** v1 — 2026-05-12, downstream of v3 design
**Branch:** `phase-j-marketing-studio` at `93f9658`, 84 ahead of `main`
**Design:** `docs/plans/2026-05-12-bbc-launch-design.md` (v3)
**Target ship:** ~2026-07-14 (9 weeks)

## §1 — Plan summary

Converts the v3 launch design into 9 weeks of executable work. Scope: ship the Library route with real data wiring, a SKILL.md-BBC strict-validator import path with prompt-injection sandbox, a connector framework with 6 connectors (Notion, GitHub, Linear, Webhook, Gmail, Drive), single-tenant Loop 3 recommender, plus landing/docs/launch artifacts. Schemas, RLS, and admin gates follow design verbatim. `external_accounts` (migration 0025) is reused for OAuth tokens — no new credentials table.

## §2 — Already done (carry-over)

- 5 studios with `Template` registries at `apps/dashboard/src/lib/studio/templates/`, per-role actions at `apps/dashboard/src/app/studio/{role}/actions.ts`
- Visual port to the paper palette across all in-app surfaces (`/welcome`, `/auth/*`, `/sources`, `/memory/[id]`, `/memory/new`); dark mode wired
- `/library` route shipped as visual port from Claude Design at commit `93f9658`; mock data in `apps/dashboard/src/app/library/_data.ts`
- `external_accounts` + AES-256-GCM (`0025_external_accounts.sql`, helpers at `apps/dashboard/src/lib/secrets/encryption.ts`)
- `AppNav` → `/library`; `/marketplace` 308-redirects via `next.config.ts`
- MCP server at `/api/mcp` (counts as design's implicit 7th source)
- AGPL `LICENSE` + Mintlify scaffold + Cloudflare deploy (`pnpm --filter @bbc/dashboard cf:deploy`)
- Invite-only auth across GitHub/Google/email via `requireActor()` + `requireRole()` at `apps/dashboard/src/lib/auth/require-user.ts`
- `cleanBlockCitations()` + tool-only `tool_choice` already wired in `apps/dashboard/src/app/studio/founder/actions.ts:163`

## §3 — Per-week deliverables

### Week 1 — Foundation + Library design pass + Google verification submitted

Branch cadence: **Merge PR #1 to `main` first** (D-W1-1). Subsequent work goes to one-deliverable feature branches off `main`, squash-merged, lifetime ≤72h.

- **D-W1-1 — Merge PR #1 to main.** Resolve conflicts, `type-check` + `cf:build` clean, squash-merge. *Acceptance:* `main` at merged SHA, Cloudflare deploy succeeds, `/library` reachable. *Depends:* —. *Effort:* S.
- **D-W1-2 — Schema migrations (5 files).** New files under `apps/dashboard/supabase/migrations/`: `0032_external_accounts_tenant_id_idx.sql`, `0033_tenant_skills.sql`, `0034_tenant_connectors.sql`, `0035_recommendations.sql`, `0036_webhook_dead_letters.sql`. Schemas verbatim from design §3/§4/§5. Order in §4 below. *Acceptance:* all 5 apply clean to a fresh project; RLS tests at `apps/dashboard/test/rls/<table>.rls.test.ts` pass (cross-tenant SELECT/UPDATE returns 0; composite FK rejects tenant-mismatched `external_account_id`). *Depends:* W1-1. *Effort:* M.
- **D-W1-3 — Delete `/graph`, confirm `/marketplace` redirect.** Remove the route dir. *Acceptance:* GET `/graph` → 404, GET `/marketplace` → 308. *Depends:* W1-1. *Effort:* XS.
- **D-W1-4 — ADR-0010 retrieval-forward-only.** `memory/decisions/0010-retrieval-forward-only.md`. *Acceptance:* indexed by `bash scripts/index-memory.sh`. *Depends:* —. *Effort:* S.
- **D-W1-5 — ADR-skill-md-bbc stub.** `memory/decisions/0011-skill-md-bbc-spec.md` (renumber if collision). Lists required `metadata.bbc.*` fields; references `docs/skill-md-bbc-spec.md` (placeholder OK in W1). *Acceptance:* file exists, indexed. *Depends:* —. *Effort:* S.
- **D-W1-6 — Submit Google OAuth verification.** Submit Gmail (`gmail.readonly`, `gmail.metadata`) + Drive (`drive.readonly`, `drive.metadata.readonly`) consent screen. Scope justification + demo video URL placeholders. *Acceptance:* "In review" status in Google Cloud Console. *Depends:* —. *Effort:* M (paperwork).
- **D-W1-7 — Library visual smoke.** Walk `/library` in dev; file any regressions from the Claude Design bundle at `docs/design/library/bbc/`. *Acceptance:* tabs switch, drawers open, dark mode toggles, mobile collapses. *Depends:* W1-1. *Effort:* S.

*Risk:* Google verification is 4–8 weeks typical for sensitive scopes. Late submission cascades into W5 beta-tag fallback.

### Week 2 — Skills layer + prompt caching + Library design applied

- **D-W2-1 — `docs/skill-md-bbc-spec.md`.** Full spec per design §3. *Acceptance:* Mintlify renders; linked from design doc + ADR. *Depends:* W1-5. *Effort:* M.
- **D-W2-2 — Strict-validator SKILL.md parser.** `apps/dashboard/src/lib/skills/skill-md-parser.ts`. Hand-rolled YAML frontmatter parse (no `js-yaml` per `apps/dashboard/CLAUDE.md`). Validates `metadata.bbc.*` (role/kind/label/hint/first_use_inputs[]/retrieval{}/citation_contract/output_kind). Returns typed `BbcSkill` compatible with the `Template` interface at `apps/dashboard/src/lib/studio/templates/types.ts`. *Acceptance:* tests at `apps/dashboard/test/skill-md-parser.test.ts` — valid passes; missing field fails with field name; unknown fields preserved in `manifest`; `firstUseInputs.kind` enum enforced; unknown `metadata.bbc.role` rejected. *Depends:* W1-2, W2-1. *Effort:* M.
- **D-W2-3 — URL-import server action + security.** `apps/dashboard/src/app/library/skills/import-action.ts`. `requireRole(actor, "admin")`. Allowlist `github.com` + `raw.githubusercontent.com`; no off-allowlist redirects; 256KB cap; parse GitHub 429 retry-after. *Acceptance:* tests at `apps/dashboard/test/skill-import/url-fetch.test.ts` cover `URL_NOT_ALLOWED`, off-allowlist redirect rejected, `BODY_TOO_LARGE`, retry-after surfaced. Manual: paste real Anthropics SKILL.md → parsed. *Depends:* W2-2. *Effort:* M.
- **D-W2-4 — Prompt-injection sandbox.** `apps/dashboard/src/lib/skills/sandbox.ts`: `buildSandboxedSystemPrompt(skill, brain)` + `scanForInjectionPatterns(body)`. Wrapper text BBC-controlled. *Acceptance:* `apps/dashboard/test/skill-import/prompt-injection.test.ts` covers AT-PI-1 through AT-PI-5 verbatim from design §3; each test comments its ID. *Depends:* W2-2. *Effort:* M.
- **D-W2-5 — Shared `validateRun()` helper.** Lift the cite-cleanup loop at `apps/dashboard/src/app/studio/founder/actions.ts:163` into `apps/dashboard/src/lib/studio/validate-run.ts`. All 5 studios + imported skills use it. Enforces manifest `citation_contract`. *Acceptance:* type-check clean; founder studio smoke unchanged; imported skill with `citation_contract: required` and bad citations fails clearly. *Depends:* W2-2. *Effort:* M.
- **D-W2-6 — Prompt caching on brain-summary block.** Add `cache_control: { type: "ephemeral" }` to the brain-summary message block in all 5 studio actions. *Acceptance:* `cache_creation_input_tokens` populated on first run, `cache_read_input_tokens` on subsequent runs <5min apart; logged once per run. *Depends:* —. *Effort:* S.
- **D-W2-7 — Library Skills tab → `tenant_skills`.** Replace mocks in `apps/dashboard/src/app/library/_data.ts` Skills section with `readTenantSkills()` at `apps/dashboard/src/lib/skills/read-tenant-skills.ts`. Built-in 5 surfaced as `source_kind='builtin'` synthetic rows. *Acceptance:* empty tenant → 5 built-ins; after import, new card appears with "Installed" pill; uninstall flips back. *Depends:* W2-3, W2-5. *Effort:* M.
- **D-W2-8 — Apply Claude Design output.** Close any gaps from the visual port against `docs/design/library/bbc/`. Keyboard nav, dark mode, mobile collapse. *Acceptance:* no visual regression vs bundle reference; Escape dismisses detail; search first-focusable. *Depends:* W1-7. *Effort:* S.

*Risk:* AT-PI tests are not exhaustive — note this in the spec doc.

### Week 3 — Connector framework + Notion + GitHub + Webhook

- **D-W3-1 — Connector framework.** `apps/dashboard/src/lib/connectors/framework.ts`: `Connector` interface verbatim from design §4, plus `runSync()` orchestrator handling token-refresh-before-sync (<24h to expiry), 429 exp-backoff with jitter, cursor persistence in `tenant_connectors.sync_state`, partial-failure commit, `source_ref` dedup vs `memory_files.fields.source_ref`, `max_proposals_per_sync` cap (default 200). `installConnector()` gated by `requireRole(actor, "admin")`. *Acceptance:* `apps/dashboard/test/connectors/framework.test.ts` — simulated 429 triggers backoff; mid-sync error persists emitted rows + cursor + `last_sync_status='partial'`; second run resumes; duplicate `source_ref` skipped. *Depends:* W1-2. *Effort:* L.
- **D-W3-2 — Notion connector.** `apps/dashboard/src/lib/connectors/notion.ts`. OAuth via Notion standard flow; token in `external_accounts` (`provider_id='notion'`, `kind='oauth_token'`). Mapping per design §4. Preview hook returns 10 sample pages. *Acceptance:* OAuth round-trip in dev; first sync of maintainer's Notion emits typed proposals to `/queue`; preview renders 10 sample rows. *Depends:* W3-1. *Effort:* M.
- **D-W3-3 — GitHub connector (PAT).** `apps/dashboard/src/lib/connectors/github.ts`. PAT auth (no OAuth review needed). Walks `docs/decisions/` + `docs/adr/` → `decision`; recent merged PRs → `note` with SHA `source_ref`; collaborators → `team`. *Acceptance:* dogfood against BBC repo — ADRs surface as decisions; PRs as notes; re-sync no dupes. *Depends:* W3-1. *Effort:* M.
- **D-W3-4 — Generic Webhook connector.** Route at `apps/dashboard/src/app/api/v1/webhooks/[tenant]/[webhook_id]/route.ts`. HMAC-SHA256 verify (`X-BBC-Signature`); 5-min replay window via `X-BBC-Timestamp`; 1MB body cap; JSONPath mapping from `tenant_connectors.mapping`; failures → `webhook_dead_letters`; 60 req/min per tenant (in-memory ring-buffer in the Worker — acceptable for v1.5). *Acceptance:* `apps/dashboard/test/connectors/webhook.test.ts` — valid sig creates proposal; bad sig → 401 + DLQ `reason='invalid_signature'`; stale ts → 401 + DLQ; >1MB → 413 + DLQ; mapping miss → DLQ `reason='mapping_rejected'`. *Depends:* W1-2. *Effort:* M.
- **D-W3-5 — Trust-through-preview install flow.** Update `apps/dashboard/src/app/library/_components/DetailDrawer.tsx` connector install path: OAuth/PAT → 10-row sample → preview surface → confirm → full sync. *Acceptance:* Notion install walk in dev — sample renders before commit; cancel aborts cleanly. *Depends:* W3-2. *Effort:* M.
- **D-W3-6 — Library Connectors tab → `tenant_connectors`.** `apps/dashboard/src/lib/connectors/read-tenant-connectors.ts`. Status badge (ok/partial/auth_expired/rate_limited). *Acceptance:* Notion connect → "Installed" + `last_sync_at` + ok; force-expire token → flips to `auth_expired` with re-auth CTA. *Depends:* W3-2, W3-3, W3-4. *Effort:* S.

### Week 4 — Linear + Loop 3 v1

- **D-W4-1 — Linear connector.** `apps/dashboard/src/lib/connectors/linear.ts`. OAuth standard. Issues → `decision` (marked) or `note`; cycles/projects → `product`. *Acceptance:* maintainer's Linear → cycle issues land as proposals; preview renders. *Depends:* W3-1. *Effort:* M.
- **D-W4-2 — Rule-based recommender.** `apps/dashboard/src/lib/loop3/recommend.ts` + `apps/dashboard/src/lib/loop3/recommend-connector.ts`. Inputs: role mix from `memory/ops/profiles/*.yaml`, per-supertag memory counts, installed skills/connectors. Outputs candidate `Recommendation` rows. *Acceptance:* `apps/dashboard/test/loop3/recommend.test.ts` — fixture with `marketing` profile + 0 marketing skills → recommends marketing built-ins; fixture with 5 decisions + no GitHub → recommends GitHub. *Depends:* W1-2. *Effort:* M.
- **D-W4-3 — Lifecycle + spam controls.** `apps/dashboard/src/lib/loop3/lifecycle.ts`. `generateRecommendations(tenantId)` enforces dedupe (partial unique on `pending`), 14-day cooldown after dismissal, max-5-active no-op (default per §8 open question). Server actions: `installRecommendation`, `dismissRecommendation`, `snoozeRecommendation`. *Acceptance:* `apps/dashboard/test/loop3/lifecycle.test.ts` — dismissed target stays gone 14 days; 6th gen at cap is no-op; install flips state and triggers actual install. *Depends:* W4-2. *Effort:* M.
- **D-W4-4 — Library "Recommended for you" wired to `recommendations`.** Replace mock recs in `_data.ts` with `readRecommendations(tenantId)` filtered to `state='pending'`. "Why this?" from `reason_human`. *Acceptance:* empty tenant first visit → band populates from recommender; dismiss removes card; re-gen within 14 days does not recreate. *Depends:* W4-3. *Effort:* S.
- **D-W4-5 — `/library` visit trigger.** Fire-and-forget `generateRecommendations(tenantId)` from `/library` server entry via `ctx.waitUntil()`. 1-hour TTL guard so we don't recompute per request. *Acceptance:* first visit after empty → band populates (or on refresh); subsequent visits within TTL don't re-run. *Depends:* W4-4. *Effort:* S.

### Week 5 — Gmail + Drive

- **D-W5-1 — Shared Google OAuth flow.** `apps/dashboard/src/lib/connectors/google-oauth.ts`. Shared consent screen for Gmail + Drive scopes; one refresh token if both granted; separate `external_accounts` rows per `provider_id`. *Acceptance:* round-trip works for each scope set independently and combined. *Depends:* W3-1. *Effort:* M.
- **D-W5-2 — Gmail connector.** `apps/dashboard/src/lib/connectors/gmail.ts`. Default query `in:inbox newer_than:30d`. Threads → `note`; user-pinned threads → `decision`; From/To headers → `team` (one-shot). *Acceptance:* test-account sync emits proposals with thread permalink `source_ref`; preview renders. *Depends:* W5-1. *Effort:* M.
- **D-W5-3 — Drive connector.** `apps/dashboard/src/lib/connectors/drive.ts`. User Drive + shared drives. Google Docs → `note`; PDFs/binary → `source_artifact`. Capped at 200 first sync. *Acceptance:* real sync emits typed proposals; Doc body extraction works. *Depends:* W5-1. *Effort:* M.
- **D-W5-4 — Verification status + beta tag.** `isGoogleAppVerified()` reads `BBC_GOOGLE_OAUTH_VERIFIED` env. False → Library cards show "beta" pill, install drawer surfaces unverified-app warning. *Acceptance:* both states render correctly. *Depends:* W5-2, W5-3. *Effort:* XS.

### Week 6 — Slack v1.1 prep + edge-case dogfood

- **D-W6-1 — Slack app submitted.** Create app at api.slack.com; configure scopes (`channels:history`, `groups:history`, `users:read`); submit to App Directory. No connector code merged. *Acceptance:* "In review" status. *Depends:* —. *Effort:* M (paperwork).
- **D-W6-2 — Edge-case matrix.** Execute against staging: auth-expired mid-sync, 429 backoff, malformed Notion blocks, oversized Drive doc, missing Gmail scopes, deleted GitHub repo, webhook secret rotation. *Acceptance:* `apps/dashboard/test/connectors/edge-cases.md` documents every scenario + pass/fail/fix-commit; all pass or have a "known limitation" entry. *Depends:* W5-3. *Effort:* L.
- **D-W6-3 — Cross-tenant RLS manual gut check.** Two-tenant manual run: tenant A installs everything; tenant B tries direct Supabase reads/writes against A's rows. *Acceptance:* documented in `apps/dashboard/test/rls/cross-tenant.md`; zero leaks. *Depends:* W6-2. *Effort:* S.
- **D-W6-4 — Sync-state diagnostics page.** Admin-only `/library/diagnostics` showing per-connector status + DLQ count. Non-admin → 404 (not 403). *Acceptance:* renders for admin; 404 otherwise. *Depends:* W6-2. *Effort:* S.

### Week 7 — Dogfood end-to-end + demo tenant fixture

- **D-W7-1 — Demo tenant fixture.** `apps/dashboard/supabase/seed/demo-tenant.sql`. Fictional startup with 50+ memories across 6+ types (5 product, 12 decisions, 8 voice, 10 glossary, 15 vendors, 8 team), 2 installed skills, 1 Notion connector with realistic sync state, 3 pending recommendations. *Acceptance:* dev load shows a populated dashboard; studios produce coherent runs; `reset_demo_tenant()` restores state. *Depends:* W4-4. *Effort:* L.
- **D-W7-2 — Full journey timing.** Walk signup → install skill → install Notion → run Marketing → review queue → install recommendation → run new skill. Measure each step. *Acceptance:* timing table at `apps/dashboard/test/journeys/launch-flow.md`; no step >5s except connector syncs (which have their own progress UI). *Depends:* W7-1. *Effort:* M.
- **D-W7-3 — Reset-demo mechanism.** Idempotent `reset_demo_tenant()` SQL function. Hosted-demo-only button (gated on `BBC_HOSTED_DEMO_MODE=true`). *Acceptance:* restores state in <10s. *Depends:* W7-1. *Effort:* S.
- **D-W7-4 — Top-3 perf bug pass.** Address the worst issues from W7-2. Likely targets: N+1 reads on `/queue`, brain-summary recompute on every studio open. *Acceptance:* re-run W7-2 closes all 3. *Depends:* W7-2. *Effort:* M.

### Week 8 — Landing + launch post + Mintlify docs

- **D-W8-1 — Landing page copy refresh.** Three pillars (Memory/Skills/Connectors), Loop 3 v1 callout, "cross-tenant signal coming v1.1" tease, demo + GitHub + BYOK CTAs. *Acceptance:* maintainer-approved; renders on production; mobile Lighthouse >90. *Depends:* —. *Effort:* M.
- **D-W8-2 — Launch post drafts.** `docs/launch/hn-post.md`, `docs/launch/twitter-thread.md`, `docs/launch/blog-post.md`. HN is the lead (subject to §8 open question). *Acceptance:* drafts reviewed; final version queued for launch day. *Depends:* —. *Effort:* M.
- **D-W8-3 — Mintlify docs.** Self-host quickstart, BYOK setup, SKILL.md-BBC spec (from `docs/skill-md-bbc-spec.md`), building a connector, importing a skill. *Acceptance:* Mintlify preview renders all pages; nav clean; search works. *Depends:* W2-1. *Effort:* L.
- **D-W8-4 — Demo videos (2x 30s).** (a) signup → install Notion → run Marketing → cited output. (b) paste GitHub URL → SKILL.md-BBC validates → installed → run from /studio. *Acceptance:* both hosted (YouTube unlisted or R2); URLs in landing + launch post. *Depends:* W7-1. *Effort:* M.
- **D-W8-5 — Privacy + terms.** `/privacy` and `/terms` pages. Plug real URLs into the Google verification submission. *Acceptance:* pages render; Google submission updated. *Depends:* —. *Effort:* S.

### Week 9 — Buffer + launch

- **D-W9-1 — Final type-check + lint + tests.** All green on `main`. *Acceptance:* green CI on deploy SHA. *Depends:* all. *Effort:* S.
- **D-W9-2 — Production deploy.** `pnpm --filter @bbc/dashboard cf:deploy`. Smoke: signup, studio run, connector install. *Acceptance:* three flows pass on production URL. *Depends:* W9-1. *Effort:* S.
- **D-W9-3 — Slack approval check.** If approved, write the connector (~1 day) and ship as v1.5 bonus; else punt to v1.5.1. *Acceptance:* decision documented; if shipping, connector tested + card live. *Depends:* W6-1. *Effort:* S–M.
- **D-W9-4 — Launch day.** HN post live; Twitter thread; blog post; team on support. *Acceptance:* posted, monitoring up. *Depends:* W8-1/W8-2/W8-3/W9-2. *Effort:* S.
- **D-W9-5 — Bug-bash buffer.** ~3 days reserved.

## §4 — Migration order (cross-cutting)

Apply in this order. Each is its own file under `apps/dashboard/supabase/migrations/`.

1. **`0032_external_accounts_tenant_id_idx.sql`** — `create unique index external_accounts_tenant_id_idx on public.external_accounts (tenant_id, id);`. Prerequisite for the composite FK in 0034. No RLS change. No backfill.
2. **`0033_tenant_skills.sql`** — full schema per design §3 with member-read + member-self-write RLS + partial unique on active. RLS verified at `apps/dashboard/test/rls/tenant_skills.rls.test.ts` (cross-tenant SELECT → 0; mismatched `installed_by` insert fails). No backfill.
3. **`0034_tenant_connectors.sql`** — schema per design §4 with composite FK `(tenant_id, external_account_id) → external_accounts(tenant_id, id)`. Webhook secret columns nullable. RLS verified at `apps/dashboard/test/rls/tenant_connectors.rls.test.ts` (cross-tenant SELECT → 0; tenant-mismatched FK insert fails). No backfill.
4. **`0035_recommendations.sql`** — schema per design §5 with `recommendations_pending_unique_idx` partial unique. RLS verified at `apps/dashboard/test/rls/recommendations.rls.test.ts` (service-role-only inserts; members update only own tenant). No backfill.
5. **`0036_webhook_dead_letters.sql`** — schema per design §4. RLS verified at `apps/dashboard/test/rls/webhook_dead_letters.rls.test.ts` (member read own tenant; cross-tenant blocked; inserts service-role-only). No backfill.

Run `bash scripts/index-memory.sh` after any memory-side ADR changes.

## §5 — ADR drafts to write

- **ADR-0010-retrieval** (`memory/decisions/0010-retrieval-forward-only.md`) — v1.5 stores `retrieval` declaration in skill manifests but inference behavior stays at `brain-summary.ts`'s top-200 type-bucketed slice (1 voice, 1 product, 5 decisions, 8 vendors, 8 team, 12 glossary). v1.5.1 begins honoring `required_types`; v1.6 activates `contextual_types.top_k` once hybrid retrieval ships. Forward-compat without launch-time token-budget surprises.
- **ADR-0011-skill-md-bbc** (`memory/decisions/0011-skill-md-bbc-spec.md`) — v1.5 imports SKILL.md only when it carries `metadata.bbc.*` (role, kind, label, hint, first_use_inputs[], retrieval{}, citation_contract, output_kind); missing fields → reject. Full spec lives at `docs/skill-md-bbc-spec.md`. Imported skills slot into the existing 5 studio template lists by declared role; no dynamic studio routes in v1.5.
- **ADR-0012-loop3-recommendation-lifecycle** (`memory/decisions/0012-loop3-recommendation-lifecycle.md`) — Loop 3 v1 recommendations live in their own `recommendations` table, not the governance queue. State machine: `pending → installed | dismissed | snoozed`. Spam: dedupe `(tenant_id, target_kind, target_id)` partial unique on `state='pending'`, 14-day cooldown after dismissal, max-5-active. Cross-tenant signal explicitly deferred to v1.1 per ADR-0009.

Stubs land in W1 (retrieval, skill-md-bbc); lifecycle lands in W4 alongside the implementation.

## §6 — Test plan (cross-cutting)

| Surface | Tests | Location |
|---|---|---|
| SKILL.md prompt injection | AT-PI-1 through AT-PI-5 per design §3 | `apps/dashboard/test/skill-import/prompt-injection.test.ts` |
| SKILL.md frontmatter validation | Required-field rejection; `firstUseInputs.kind` enum; unknown role rejected | `apps/dashboard/test/skill-md-parser.test.ts` |
| URL import security | Allowlist; off-allowlist redirect; size cap; rate-limit retry-after | `apps/dashboard/test/skill-import/url-fetch.test.ts` |
| Connector OAuth refresh | <24h-to-expiry triggers refresh; failed refresh sets `auth_expired`; re-auth CTA | `apps/dashboard/test/connectors/oauth-refresh.test.ts` |
| Connector partial failure + idempotency | Mid-sync error commits + cursor; resume from cursor; duplicate `source_ref` skipped | `apps/dashboard/test/connectors/framework.test.ts` |
| Webhook security | HMAC; replay window; 1MB cap; per-tenant rate limit; DLQ rows per failure mode | `apps/dashboard/test/connectors/webhook.test.ts` |
| Cross-tenant RLS | Member of A cannot SELECT/UPDATE tenant B rows on the 4 new tables | `apps/dashboard/test/rls/<table>.rls.test.ts` |
| Recommendation spam controls | Dedupe (partial unique); 14-day cooldown; max-5 no-op; install transition | `apps/dashboard/test/loop3/lifecycle.test.ts` |
| Recommendation generation | Profile-match skills; gap-rule connectors | `apps/dashboard/test/loop3/recommend.test.ts` |
| Studio prompt caching | `cache_creation_input_tokens` then `cache_read_input_tokens` within 5min | manual smoke + once-per-run log |
| Library visual smoke | Each tab renders; drawers open; import reaches flagged state; dark mode toggles | Playwright at `apps/dashboard/test/library.e2e.ts` or manual |
| Demo tenant journey | Full launch flow <5s per step | `apps/dashboard/test/journeys/launch-flow.md` |

## §7 — Dependencies + parallelism

```
W1 (foundation + schemas + Google verification submission)
 │
 ├─► W2 (skills layer — needs schemas)
 │    │
 │    ├─► W3 (connector framework — reuses parser + sandbox patterns)
 │    │    │
 │    │    ├─► W4 (Linear + Loop 3 — needs framework + recommendations table)
 │    │    │
 │    │    └─► W5 (Gmail + Drive — needs framework only)
 │    │
 │    └─► (prompt caching + library design — no downstream blockers)
 │
 └─► Google verification (external, parallel; resolves in W4–W8)
      └─► W5-4 status check (beta tag vs verified)

W6 — Slack submission (parallel external) + edge-case dogfood (needs W5 done).
W7 — demo fixture + journey timing (needs W4 recs + W6 clean for timing).
W8 — landing + launch post + Mintlify (parallel; videos need W7).
W9 — buffer + ship.
```

| Track | Parallel within | Serializes against |
|---|---|---|
| Google verification | All weeks (external) | W5-4 outcome check |
| Slack submission | W6 onward (external) | W9-3 ship decision |
| Connector implementations | W3 has 3 in parallel after framework lands | W3-1 first |
| Loop 3 (W4) | Independent of W5 | Needs W1-2 recommendations table |
| Docs (W8) | All 5 W8 deliverables independent | Videos need W7-1 |

## §8 — Open questions for the user

1. **Demo fixture content** — fictional ("Anvil" CI/CD-for-iOS hypothetical) OR sanitized seed from a real maintainer side-project? Fictional adds ~1d in W7; real-data path may leak.
2. **Launch post placement** — HN top-level as the lead (current assumption), OR blog-post-first with HN as a Show HN link? Affects when W8-2's blog post must be done.
3. **Beta tag treatment for Gmail/Drive at W9 if verification still pending** — yellow "beta" pill OR a hard unverified-app warning page that interrupts install? W5-4 currently does the warning-page variant.
4. **Webhook rate-limit storage** — in-Worker ring buffer (W3-4 current assumption — resets on cold start) OR Cloudflare KV counters (~half-day more, more correct)?
5. **Slack scope at v1.1** — read-only (`channels:history`) only, or also post-message? Determines W6-1 submission.
6. **Max-active recommendation overflow** — no-op (simpler, current default) OR replace oldest pending? Design §5 allows both.
7. **Reset-demo button visibility** — hosted-demo-only (`BBC_HOSTED_DEMO_MODE=true` gate), or also per-tenant admin nuke in self-host? Latter expands support surface.

---

**Implementation begins on D-W1-1** once §8 is resolved.
