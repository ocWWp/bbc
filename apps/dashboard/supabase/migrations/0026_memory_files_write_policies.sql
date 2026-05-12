-- Phase J/K staging fix: memory_files write policies.
--
-- Migration 0005 only granted SELECT on memory_files, with a comment saying
-- writes were service_role only "for now." Phase H wired the welcome flow
-- (apps/dashboard/src/app/welcome/actions.ts) and subsequent Phase J/K flows
-- to write via the user-session Supabase client. Those writes were blocked
-- by RLS in staging until this migration.
--
-- Pattern mirrors ingestion_sources / studio_runs / external_accounts:
-- member-of-tenant gate on every write.

create policy memory_files_member_insert on public.memory_files
  for insert with check (public.is_member_of(tenant_id));

create policy memory_files_member_update on public.memory_files
  for update using (public.is_member_of(tenant_id));

create policy memory_files_member_delete on public.memory_files
  for delete using (public.is_member_of(tenant_id));
