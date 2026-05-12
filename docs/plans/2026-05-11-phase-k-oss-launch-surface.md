# Phase K — OSS launch surface (rewritten post-ADR-0007)

> **For Claude:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task.

**Goal:** Take BBC from "self-host but it's hard" to "anyone with a GitHub + Vercel account has a working BBC in 5 minutes." Per ADR-0007 the product is free AGPLv3; this phase builds the launch surface that turns OSS into a real distribution channel.

**Why this exists:** Phase J shipped the hero product. Without Phase K nobody can actually try it without devops chops. Without a real README and a Deploy-to-Vercel button, GitHub stars stay at zero and Show HN flops.

**Output:** After Phase K:
- `README.md` reads like a Plausible/Cal.com OSS README (positioning + GIF + install in 3 commands + philosophy + license)
- "Deploy to Vercel" button works end-to-end: fork → click → 5 min later you have a tenant
- New users land at `/welcome` and paste their Anthropic + Supabase keys (BYOK) — never the maintainer's
- `/marketplace` shows the provider directory with bind/unbind
- `/settings/keys` lets users rotate/delete their stored keys
- Tenant-provided keys (when present) override `process.env.ANTHROPIC_API_KEY` for that tenant's server actions

**Non-goals (deferred):**
- Stripe / paywall / credit metering — removed by ADR-0007
- Multi-user team billing — there's no billing
- Brain map / Sigma.js visualization — moved to Phase L proper
- MCP write tools — pulled forward only if cheap; otherwise defer to L
- OAuth integrations (GitHub, Notion, Linear, Slack) — defer to Phase M
- Mintlify docs site — defer to Phase L

**Branch:** new branch `phase-k-oss-launch` off `main` after PR #1 merges. While PR #1 is open we work on `phase-k-oss-launch` based off `phase-j-marketing-studio` so we can land both together if needed.

**Commit cadence:** one per task. 10 tasks total.

---

## Group 1 — Schema + key encryption (2 tasks)

### Task K.1: Migration — `external_accounts` table

Create `apps/dashboard/supabase/migrations/0025_external_accounts.sql`:

- Table: `id uuid pk`, `tenant_id uuid fk tenants`, `provider_id text not null` (e.g. `anthropic`, `openai`, `supabase`), `kind text not null` (`api_key`, `oauth_token`, `connection_string`), `secret_ciphertext bytea not null`, `secret_iv bytea not null`, `secret_tag bytea not null` (AES-256-GCM), `display_hint text` (e.g. last 4 chars `…sx9P`), `status text not null default 'active'` (`active`, `revoked`), `created_by uuid fk auth.users`, `created_at timestamptz default now()`, `revoked_at timestamptz`
- Unique partial index: one active row per `(tenant_id, provider_id, kind)`
- RLS: `external_accounts_member_read`, `_insert`, `_update` — all gated on `is_member_of(tenant_id) and created_by = auth.uid()`
- No raw-secret select policy — secrets are only read by server-side decryption helper, never returned to the client
- Encryption key lives in `BBC_SECRET_ENCRYPTION_KEY` env var (32 raw bytes, base64-encoded)

**Commit:** `Phase K.1: migration — external_accounts table`

### Task K.2: Server-side encryption helpers

Create `apps/dashboard/src/lib/secrets/encryption.ts`:

- `encryptSecret(plaintext: string): { ciphertext: Buffer; iv: Buffer; tag: Buffer }`
- `decryptSecret(ciphertext, iv, tag): string`
- AES-256-GCM via `node:crypto`
- Throws clear errors if `BBC_SECRET_ENCRYPTION_KEY` missing or wrong size
- Display-hint generator: `makeDisplayHint(secret) → "…xxxx"` (last 4 chars, never first chars)
- Unit-test fixtures: round-trip encrypt → decrypt; tamper detection (modified tag must throw)

**Commit:** `Phase K.2: AES-256-GCM secret encryption helpers`

---

## Group 2 — BYOK welcome + settings (3 tasks)

### Task K.3: Server actions for tenant keys

Create `apps/dashboard/src/app/settings/keys/actions.ts`:

- `setProviderKey(providerId: 'anthropic' | 'openai', kind: 'api_key', plaintext: string)` — validates shape per provider (anthropic regex from `welcome/actions.ts` PII rules), revokes prior active row, inserts new row with ciphertext
- `revokeProviderKey(externalAccountId: string)`
- `listProviderKeys()` — returns `{providerId, kind, displayHint, status, createdAt}` only; never the secret
- All three require `requireActor()` + `requireRole('member')`
- Test: post a known-good fixture key → row appears with display hint → revoke → row marked revoked

**Commit:** `Phase K.3: provider-key server actions`

### Task K.4: `/settings/keys` route

Create `apps/dashboard/src/app/settings/keys/page.tsx` + client component:

- Lists active keys (provider chip + display hint + created date + revoke button)
- "Add a key" inline form (provider select + paste field). Submit calls `setProviderKey`.
- Empty state: "No keys yet. The hosted demo uses the maintainer's shared key with daily limits — add your own for unlimited."
- Hash route `/settings/keys?added=anthropic` highlights the new row briefly

**Commit:** `Phase K.4: /settings/keys route`

### Task K.5: `/welcome` BYOK step

Extend `apps/dashboard/src/app/welcome/Onboarding.tsx`:

- New step before the brain-dump: "Connect your AI" with a paste field for Anthropic key
- Two CTAs: "Use my key" (saves + advances) and "Use the hosted demo" (skips and uses maintainer's key with daily caps)
- Server-side note in the action: if the maintainer's `ANTHROPIC_API_KEY` is the production-restricted shared key (env var `BBC_HOSTED_DEMO_MODE=true`), the welcome flow soft-requires BYOK before extraction
- Per-tenant key resolution helper: `getTenantAnthropicKey(supabase, tenantId): Promise<string>` — returns the tenant's decrypted key if present, else falls back to env

**Commit:** `Phase K.5: BYOK step in /welcome`

---

## Group 3 — Tenant key routing in server actions (1 task)

### Task K.6: Route tenant-provided keys through every LLM call

Update every `new Anthropic({ apiKey })` call site to use `getTenantAnthropicKey()` instead of `process.env.ANTHROPIC_API_KEY` directly. Call sites at start of Phase K (audit):

- `src/app/welcome/actions.ts` (extractor)
- `src/app/studio/marketing/actions.ts` (proposeWorkflows, runWorkflow, proposeOverride)

Helper centralizes the fallback chain:
1. Tenant's active `external_accounts` row for `anthropic` (decrypted)
2. `process.env.ANTHROPIC_API_KEY` (hosted-demo / dev fallback)
3. Return clear error `{ ok: false, error: "No AI key configured. Add one in Settings → Keys." }`

Add `costAttribution: 'tenant_byok' | 'hosted_demo_shared'` to the LLM response logging so the maintainer can see who's eating which budget.

**Commit:** `Phase K.6: route tenant-provided Anthropic keys through all LLM calls`

---

## Group 4 — Marketplace as provider directory (2 tasks)

### Task K.7: `/marketplace` route

Create `apps/dashboard/src/app/marketplace/page.tsx`:

- Server-fetches `memory/ops/providers/*.yaml` via the existing file-mode + DB-mode store
- Renders a grid of provider cards: name (role), supported adapters, status (active / candidate / deprecated), homepage link
- Each card has a "Bind" or "Unbind" button per provider role (writes to `bindings` table)
- Filter by role (llm-provider, db-provider, email-delivery, video-gen, etc.) via top tabs

**Commit:** `Phase K.7: /marketplace provider directory`

### Task K.8: Bind/unbind server actions

Create `apps/dashboard/src/app/marketplace/actions.ts`:

- `bindProvider(role: string, providerId: string)` — upserts a `bindings` row scoped to tenant
- `unbindProvider(role: string)` — soft-delete via `provisional=true` or hard delete (decide per RLS)
- Both require `member` role
- Revalidate `/marketplace` on each

**Commit:** `Phase K.8: bind/unbind server actions`

---

## Group 5 — Self-host launch surface (2 tasks)

### Task K.9: `vercel.json` + env template + Deploy-to-Vercel button

Create `apps/dashboard/vercel.json`:

- Build / dev / install commands matching the workspace setup
- Required + optional env vars declared in `env` block

Create `.env.example` at repo root with every BBC env var documented:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (warning: long-lived; keep this short)
- `ANTHROPIC_API_KEY` (optional — BYOK preferred)
- `BBC_SECRET_ENCRYPTION_KEY` (required for K.2 encryption)
- `BBC_HOSTED_DEMO_MODE` (false by default)
- `RESEND_API_KEY` (optional)
- `SENTRY_DSN` (optional)
- `NEXT_PUBLIC_POSTHOG_KEY` (optional)

Update `README.md` with the Deploy-to-Vercel button using the appropriate vercel template URL. Smoke-test it: fork → click → land on a tenant.

**Commit:** `Phase K.9: vercel.json + .env.example + Deploy-to-Vercel button`

### Task K.10: README OSS rewrite

Rewrite `README.md` for the OSS audience. Sections in order:

1. Hero — one-sentence pitch, screenshot/GIF, three badges (license / stars / build)
2. Why BBC — three short bullets (free your data, voice-grounded outputs, founder-first)
3. Quick start (3 commands or click-to-deploy)
4. What's in v1 — link to design doc + ADR list
5. Self-host vs hosted demo
6. License + AGPL FAQ link
7. Contributing — link to CONTRIBUTING.md (stub for now, real in Phase L)
8. Project status (alpha, breaking changes possible)

Keep it < 250 lines. Drop the "leaf / manager / distribution" framing from the top — that's internal architecture, not user value. Move it under a `## Architecture` section near the bottom.

**Commit:** `Phase K.10: README OSS rewrite`

---

## Group 6 — Verification (1 task)

### Task K.11: Full BYOK self-host smoke test

Run end-to-end:

1. `pnpm exec tsc --noEmit` clean
2. `pnpm --filter @bbc/dashboard build` clean
3. Spin up dev server, walk a fresh signup → /welcome BYOK paste → brain dump → Studio run with the tenant's own key
4. Verify the tenant's key is decrypted server-side and used in the Anthropic call (log `costAttribution=tenant_byok`)
5. Hit `/marketplace`, bind a provider, unbind it
6. Click Deploy-to-Vercel on a clean fork → verify it lands

Write up the verification report in `docs/plans/2026-05-11-phase-k-smoke-test-report.md` mirroring the J.17 format.

**Commit:** `Phase K.11: smoke test report` (verification only — no code)

---

## Summary

| Group | Tasks | Output |
|---|---|---|
| 1. Schema + encryption | K.1–K.2 | external_accounts table + AES-GCM helpers |
| 2. BYOK welcome + settings | K.3–K.5 | provider-key actions + /settings/keys + /welcome BYOK step |
| 3. Tenant key routing | K.6 | every LLM call goes through getTenantAnthropicKey() |
| 4. Marketplace | K.7–K.8 | /marketplace provider directory + bind/unbind |
| 5. Launch surface | K.9–K.10 | vercel.json + .env.example + Deploy-to-Vercel + OSS README |
| 6. Verification | K.11 | smoke-test report |

**Total: 11 tasks, ~1-1.5 weeks of focused work.**

## Risks

- **Encryption-key rotation is not in v1.** If `BBC_SECRET_ENCRYPTION_KEY` rotates, every encrypted secret in the DB is unreadable. Mitigation: document this loudly in `.env.example`; key-rotation tooling deferred to v1.x.
- **Anthropic key paste is the single point of failure in /welcome.** If users skip it and the hosted demo cap kicks in, the funnel falls off a cliff. Mitigation: clear copy + the hosted-demo cap shows a "you've hit today's free runs — add a key" CTA.
- **Deploy-to-Vercel needs a Supabase project too.** One-click for the dashboard is easy; Supabase still needs the user to create a project + run migrations. Mitigation: document the Supabase setup as a 2-minute add-on in the README; investigate `supabase --link` flow later.
- **`bindings` table interactions with F4 provider interface.** F4 designs the same `bindings` table for the role-adapter model. Phase K writes through the existing schema without anticipating F4 — accept this as tech debt; F4 build phases will refactor.

## Phase K is complete when

1. All 11 tasks committed atomically on `phase-k-oss-launch`
2. Typecheck + build clean
3. Smoke test passes end-to-end with a fresh tenant + tenant-supplied Anthropic key
4. Deploy-to-Vercel button lands a working BBC in < 10 minutes from fork
5. README on `main` reads like an OSS project, not an internal protocol doc
6. Branch merged to `main`

## What's next after Phase K

- **Phase L — Landing page + brain map + docs + soft launch** (~1.5 weeks, per ADR-0007 rewrite). Landing at bbc.tools, AGPL FAQ, brain map with Sigma.js, Mintlify docs, GitHub repo polish, Show HN / Product Hunt sequence.
- **Phase M — Role generalization** (pulls F2 + F4 forward). Templates gain a `role` field; build legal / accounting / sales template libraries alongside marketing.
- **Phase N — Tool credibility + Perplexity loop** (F1). Weekly job re-scores tools/skills via external signals.
- **Phase O — Video output** (pull-forward from F4 + new OutputBlock kind). Higgsfield/Veo adapter + VideoCard preview when a paying customer or sponsor exists.

Phase O is the "ship video" item the maintainer asked about earlier. Gated behind Phase K + L because there's no point shipping video gen against zero users.
