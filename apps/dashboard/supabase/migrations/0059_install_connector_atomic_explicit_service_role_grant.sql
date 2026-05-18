-- Phase K install-flow follow-up: make 0058's service_role grant explicit.
--
-- Codex round-3 review of PR #24 flagged 0058 as a P1: after `revoke execute
-- from public, anon, authenticated`, the migration never explicitly grants
-- execute to `service_role`, yet both call sites (apps/dashboard/src/app/
-- library/install/_actions.ts and apps/dashboard/src/app/api/oauth/google/
-- callback/route.ts) invoke the RPC through `getSupabaseServiceClient()`.
-- A strict reading of 0058 says the function is uncallable post-revoke.
--
-- Empirically the install flow works because Supabase ships `ALTER DEFAULT
-- PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO service_role`
-- (see pg_default_acl). So when 0057's CREATE FUNCTION ran as `postgres`,
-- service_role auto-acquired EXECUTE via that default. 0058's REVOKE only
-- names public/anon/authenticated, leaving service_role's grant intact.
--
-- 0058's inline comment said service_role "bypasses RLS and grants by
-- default" — that conflates RLS bypass (true) with function grants (false).
-- The grant is real and explicit on `pg_proc.proacl`, but it comes from a
-- platform default, not from the migration file. That's brittle: a future
-- Postgres or self-hosted setup without Supabase's default ACL would break
-- both install paths.
--
-- Fix: state the grant explicitly so the migration is self-documenting and
-- portable. This is a no-op against staging (service_role already has the
-- grant) — it's documentation enforced by SQL.

grant execute on function public.install_connector_atomic(
  uuid, uuid, text, text, public.external_account_kind,
  bytea, bytea, bytea, bytea, bytea, bytea,
  timestamptz, text[], text, jsonb
) to service_role;

notify pgrst, 'reload schema';
