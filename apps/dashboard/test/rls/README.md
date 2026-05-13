# RLS tests

Live-DB tests covering row-level security on the 4 tables added by v1.5 migrations 0033–0036.

## What they assert

Every test provisions two isolated tenants (A and B) with one admin user each, then asserts:

- **Cross-tenant SELECT returns 0.** User A signed in cannot see tenant B's rows on any of the 4 tables.
- **Cross-tenant UPDATE affects 0 rows.** User A cannot modify B's rows.
- **Member-self-write enforced** on `tenant_skills` + `tenant_connectors` (the `installed_by = auth.uid()` check on insert/update).
- **Composite FK rejection** on `tenant_connectors` — inserting with an `external_account_id` from another tenant fails.
- **Service-role-only inserts** on `recommendations` + `webhook_dead_letters` — authenticated members cannot insert.

These are the acceptance criteria for D-W1-2 in `docs/plans/2026-05-12-bbc-launch-plan.md`.

## Running

```bash
# from apps/dashboard
pnpm test:rls
```

Required env (in `.env.local` or shell):

| Var | Source |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Anon/publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | Service-role key |

The harness picks these up via `process.env` and fails fast if any are missing.

## Why this hits the live DB

There's no local Supabase stack wired into this repo (no `supabase` CLI, no docker setup). Until that lands, RLS tests run against the live staging project (`bbc-staging`). Every test run creates two ephemeral tenants and tears them down — collisions are avoided by suffixing every test name with a random 8-char run ID.

If a test crashes mid-run and leaves rows behind, clean up manually:

```sql
delete from auth.users where email like 'rls-test-%@bbc.test';
delete from public.tenants where slug like 'rls-test-%';
```

Cascade deletes will handle the rest.

## Files

- `_helpers.ts` — `setupTwoTenants()`, `teardownTwoTenants()`, plus service-role seed helpers for each of the 4 tables.
- `tenant_skills.rls.test.ts`
- `tenant_connectors.rls.test.ts`
- `recommendations.rls.test.ts`
- `webhook_dead_letters.rls.test.ts`
