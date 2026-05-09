-- Phase 4 smoke test for create_tenant_with_seed.
-- Run against the live Supabase project. Uses an existing user
-- (phase1test@gmail.com from Phase 1 smoke tests). Cleans up after itself.

-- 1. Bootstrap a synthetic tenant
do $$
declare
  v_user uuid;
  v_tenant uuid;
begin
  select id into v_user from auth.users where email = 'phase1test@gmail.com';
  if v_user is null then
    raise exception 'phase1test user not found — re-run Phase 1.B smoke first';
  end if;
  v_tenant := public.create_tenant_with_seed('phase4-smoke', 'Phase 4 Smoke', v_user);
  raise notice 'created tenant %', v_tenant;
end $$;

-- 2. Verify the seed counts
select 'tenants' as t, slug as detail from public.tenants where slug = 'phase4-smoke'
union all
select 'tenant_members', user_id::text from public.tenant_members tm
  join public.tenants t on t.id = tm.tenant_id where t.slug = 'phase4-smoke'
union all
select 'memory_files (' || count(*)::text || ' rows)', string_agg(path, ', ' order by path) from public.memory_files mf
  join public.tenants t on t.id = mf.tenant_id where t.slug = 'phase4-smoke'
union all
select 'bindings (' || count(*)::text || ' rows)', string_agg(role, ', ' order by role) from public.bindings b
  join public.tenants t on t.id = b.tenant_id where t.slug = 'phase4-smoke'
union all
select 'queue_items', proposal_id from public.queue_items qi
  join public.tenants t on t.id = qi.tenant_id where t.slug = 'phase4-smoke'
union all
select 'operations_log', actor || ' ' || action || ' ' || target from public.operations_log ol
  join public.tenants t on t.id = ol.tenant_id where t.slug = 'phase4-smoke';

-- Expected output:
--   tenants                phase4-smoke
--   tenant_members         <user_id>
--   memory_files (3 rows)  CLAUDE.md, memory/_schema.md, memory/decisions/0001-bbc-tenant-bootstrap.md
--   bindings (3 rows)      db-provider, email-delivery, llm-provider
--   queue_items            prop_<YYYYMMDD>_sample_first_proposal
--   operations_log         human:phase1test tenant_bootstrap phase4-smoke

-- 3. Verify revoke posture (authenticated cannot invoke directly)
do $$
declare
  v_user uuid;
begin
  select id into v_user from auth.users where email = 'phase1test@gmail.com';
  execute format('set local request.jwt.claim.sub = %L', v_user::text);
  execute 'set local role authenticated';
  begin
    perform public.create_tenant_with_seed('should-fail', 'Should Fail', v_user);
    raise notice 'TEST FAILED: authenticated could invoke create_tenant_with_seed';
  exception when sqlstate '42501' then
    raise notice 'OK: authenticated denied (42501 permission denied)';
  end;
end $$;

-- 4. Cleanup via cascade
delete from public.tenants where slug = 'phase4-smoke';
select count(*) as residual_memory_files
  from public.memory_files mf
  join public.tenants t on t.id = mf.tenant_id where t.slug = 'phase4-smoke';
-- Expect 0.
