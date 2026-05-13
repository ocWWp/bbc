-- v1.5 launch polish: RBAC — migrate existing members + RLS rewrite + helper.
--
-- Per ADR-0012. Runs AFTER 0037 commits the 'operator' enum value.
--
-- - Existing 'member' rows migrate to 'operator' so live tenants keep their
--   current write power.
-- - 'member' becomes the new read-only-plus-propose role for invited teammates.
-- - is_operator_of() mirrors the hardening pattern of is_member_of() in 0003:
--     security definer, set search_path = public, auth, execute revoked
--     from public/anon/authenticated.
-- - memory_files write policies move from is_member_of() to is_operator_of().
--   Member SELECT policy is unchanged (members keep read access via /brain).

-- Migrate existing members. Idempotent: 'operator' rows remain operator.
update public.tenant_members
  set role = 'operator'::public.tenant_role
  where role = 'member'::public.tenant_role;

-- is_operator_of(): true if the calling user is admin OR operator in p_tenant_id.
create or replace function public.is_operator_of(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.tenant_members
    where tenant_id = p_tenant_id
      and user_id = auth.uid()
      and role in ('admin'::public.tenant_role, 'operator'::public.tenant_role)
  );
$$;
revoke execute on function public.is_operator_of(uuid) from public, anon, authenticated;

-- memory_files write RLS: replace member gates with operator gates.
-- SELECT policy unchanged — members keep read access via /brain.
drop policy if exists memory_files_member_insert on public.memory_files;
drop policy if exists memory_files_member_update on public.memory_files;
drop policy if exists memory_files_member_delete on public.memory_files;

create policy memory_files_operator_insert on public.memory_files
  for insert with check (public.is_operator_of(tenant_id));

create policy memory_files_operator_update on public.memory_files
  for update using (public.is_operator_of(tenant_id));

create policy memory_files_operator_delete on public.memory_files
  for delete using (public.is_operator_of(tenant_id));
