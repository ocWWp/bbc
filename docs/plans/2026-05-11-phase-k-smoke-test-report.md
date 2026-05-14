# Phase K.11 — BYOK self-host smoke test report

**Branch:** `phase-j-marketing-studio` (Phase K work landed on the same branch since PR #1 is still open against `main`)
**Date:** 2026-05-11
**Env:** local dev, stub Supabase mode (no `NEXT_PUBLIC_SUPABASE_URL`) + no `ANTHROPIC_API_KEY`

## What was verified locally

1. **Type-check** — `pnpm exec tsc --noEmit` clean across all of Phase K. ✓
2. **Production build** — `pnpm --filter @bbc/dashboard build` succeeds. New routes appear in the build manifest:
   - `ƒ /marketplace`
   - `ƒ /settings/keys`
   - All Phase J routes (`/studio/marketing`, `/studio/preview`) still present. ✓
3. **Dev server boots** — `pnpm dev --port 3001` serves without runtime errors. ✓
4. **Route response codes** (unauthenticated):
   | Route | Code | Expected |
   |---|---|---|
   | `/studio/preview` | 200 | public, ✓ |
   | `/marketplace` | 200 | gates via middleware only; reads filesystem providers, ✓ |
   | `/settings/keys` | 307 → `/auth/signin?callbackUrl=/settings/keys` | auth-gated, ✓ |
   | `/studio/marketing` | 307 → signin | auth-gated, ✓ |
   | `/welcome` | 307 → signin | auth-gated, ✓ |
5. **Marketplace renders the provider directory.** Visited via Playwright; all 7 role buckets render (`ai models`, `databases`, `email`, `hosting`, `analytics`, `api hosting`, `design sources`) with provider cards showing id + headline + description + tag chips + status pill (candidate/active) + bound badge where applicable. Screenshot at `/Users/ocwwp/Desktop/BB-C/marketplace-light.png`.

## What requires staging to verify

Same three preconditions as the J.17 report:
- Running Supabase project with Phase J + K migrations applied (0023, 0024, **0025 new**)
- Real `ANTHROPIC_API_KEY` *or* a tenant BYOK key for the signed-in user
- `BBC_SECRET_ENCRYPTION_KEY` set on the deploy (32 raw bytes, base64) so the encryption helpers don't throw

Once those are present, run through the following:

| # | Check | Pass criterion |
|---|---|---|
| 1 | `/settings/keys` add flow | Paste a real Anthropic key → display hint `…xxxx` appears in the Active list; ciphertext columns populate in `external_accounts`; the same key never appears in the response payload. |
| 2 | Replace key | Paste a second key for the same provider → previous active row flips to `revoked`, new row is active; unique partial index never violated. |
| 3 | Revoke | Click Revoke → row flips to `revoked` with `revoked_at` timestamp. |
| 4 | `/welcome` BYOK banner | Sign in as a tenant with no Anthropic external_account → studio-accent banner appears above the brain-dump prompt. Paste a key inline → banner swaps to "Key saved." |
| 5 | Tenant-key routing | Add an Anthropic key, run a `/studio/marketing` workflow → server log shows `cost=tenant_byok`. Revoke it, env var still set → next run logs `cost=hosted_demo_shared`. Revoke env var → next run errors with "No Anthropic API key configured." |
| 6 | `/marketplace` rendering with bindings | Bind a provider in the tenant's `bindings.yaml` → the marketplace card for that provider shows the studio-accent "Bound" pill + ring. Other providers in the same role show as candidates. |
| 7 | Deploy-to-Vercel button | Click the README button → Vercel clone flow appears with the 5 env-var fields auto-populated from the URL. Provide values → deploy succeeds → `/studio/preview` opens on the deployed URL. |
| 8 | Encryption tamper detection | Manually corrupt one byte of `secret_tag` in the DB → `decryptSecret` throws → `runWorkflow` falls back to env var; never silently returns garbage plaintext. |
| 9 | Encryption key rotation guard | Change `BBC_SECRET_ENCRYPTION_KEY` and restart the server → every prior encrypted row fails decryption; the welcome banner re-appears for affected tenants prompting them to re-paste. Documented as a deliberate v1 limitation in `.env.example`. |
| 10 | Migrations applied in order | Verify the staging Supabase has rows for the new enum types (`external_account_kind`, `external_account_status`) and the unique partial index `external_accounts_active_unique_idx`. |

## What changed in the Phase K branch (11 commits)

```
K.1   migration: external_accounts (encrypted BYOK table)
K.2   AES-256-GCM encryption helpers
K.3   provider-key server actions
K.4   /settings/keys route
K.5   /welcome BYOK banner
K.6   route tenant keys through every LLM call (4 sites)
K.7+8 /marketplace provider directory (read-only; bind/unbind via queue)
K.9   vercel.json + expanded .env.example
K.10  README OSS rewrite + Deploy-to-Vercel button
K.11  this report
```

## Gates before Phase K can merge

1. Apply all migrations 0020-0025 against staging (I.20 + J + K). No checklist file for 0023-0025 yet; mirror the I.20 pattern.
2. Set `BBC_SECRET_ENCRYPTION_KEY` on the staging deploy. **Do not skip** — every BYOK insert fails without it.
3. Set `BBC_HOSTED_DEMO_MODE=true` on the hosted bbc.tools instance only; leave `false` for self-host.
4. Walk the 10 staging verifications above. Screenshot success states.
5. Merge PR #1 (carries Phase J + K commits together).

## After Phase K merges

- **Phase L** — landing page polish + Mintlify docs + Show HN preparation. Per `docs/plans/2026-05-10-bbc-user-facing-product-design.md` §12.
- **Phase M+** — role generalization, F1 credibility ranker, video output. All gated on Phase L launch traction.
