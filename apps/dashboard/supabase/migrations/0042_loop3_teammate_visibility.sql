-- v1.5 launch polish (Task 0g): Loop-3 visibility flag.
--
-- v1.5 introduces the new 'member' role (per ADR-0012): read-only on memory,
-- can file proposals, runs their own Studio. Loop-3 recommendations
-- (skill/connector/provider suggestions in the Library) should default to
-- admin-only so members aren't asked to make tenant-wide install decisions.
-- The admin can flip the per-tenant flag to 'everyone' once they trust their
-- teammates to surface relevant suggestions.
--
-- Per-tenant flag is the v1.5 simplification; ADR-0009 §scope plans
-- per-member scoping in Phase N.

alter table public.tenants
  add column if not exists loop3_teammate_visibility text not null default 'admin_only'
    check (loop3_teammate_visibility in ('admin_only', 'everyone'));

-- SELECT: operators/admins always; members only when the tenant flag is
-- 'everyone'. Replaces recommendations_member_read from 0035.
drop policy if exists recommendations_member_read on public.recommendations;

create policy recommendations_select on public.recommendations
  for select using (
    public.is_member_of(tenant_id)
    and (
      public.is_operator_of(tenant_id)
      or exists (
        select 1
        from public.tenants t
        where t.id = recommendations.tenant_id
          and t.loop3_teammate_visibility = 'everyone'
      )
    )
  );

-- UPDATE: dismiss/snooze/install state changes are tenant-wide actions; only
-- operators/admins should make them. Members reading via the 'everyone' flag
-- see suggestions but cannot resolve them.
drop policy if exists recommendations_member_update on public.recommendations;

create policy recommendations_operator_update on public.recommendations
  for update using (public.is_operator_of(tenant_id))
  with check (public.is_operator_of(tenant_id));

-- INSERT/DELETE remain service-role only (the recommender generates rows
-- without auth.uid()).
