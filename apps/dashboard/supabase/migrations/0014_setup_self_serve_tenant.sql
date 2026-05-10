-- Phase Y.2 migration 0014: setup_self_serve_tenant
-- Atomically creates a tenant + admin invitation for an email, in advance of
-- the user's signup. The signup trigger then sees the invitation and accepts.
--
-- Used by the /api/auth/self-serve-signup route handler when the system is
-- configured for open signup (BBC_SIGNUP_MODE=open env var on the dashboard).

create or replace function public.setup_self_serve_tenant(
  p_email text,
  p_slug  text,
  p_name  text
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_tenant_id uuid;
  v_email     text;
begin
  if p_email is null or length(trim(p_email)) = 0 then
    raise exception 'invalid_input: email required' using errcode = 'P0006';
  end if;
  if p_slug !~ '^[a-z][a-z0-9-]{2,62}$' then
    raise exception 'invalid_input: slug must match ^[a-z][a-z0-9-]{2,62}$' using errcode = 'P0006';
  end if;
  if p_name is null or length(trim(p_name)) = 0 then
    raise exception 'invalid_input: name required' using errcode = 'P0006';
  end if;

  v_email := lower(trim(p_email));

  if exists (
    select 1 from public.tenant_invitations
    where provider = 'email' and identifier = v_email
  ) then
    raise exception 'already_invited: an invitation already exists for %', v_email
      using errcode = 'P0007';
  end if;

  insert into public.tenants (slug, name, plan, created_by)
  values (p_slug, p_name, 'free', null)
  returning id into v_tenant_id;

  insert into public.tenant_invitations (tenant_id, provider, identifier, role, invited_by)
  values (v_tenant_id, 'email', v_email, 'admin', null);

  insert into public.bindings (tenant_id, role, provider_id, provisional, bound_at, notes) values
    (v_tenant_id, 'db-provider',    '(unbound)', false, now(), 'Bind when you wire your first persistent store.'),
    (v_tenant_id, 'llm-provider',   '(unbound)', false, now(), 'Bind when you wire your first agent integration.'),
    (v_tenant_id, 'email-delivery', '(unbound)', false, now(), 'Bind when you need transactional or marketing email.');

  insert into public.operations_log (tenant_id, v, actor, action, target, payload)
  values (
    v_tenant_id, 1, 'system:self-serve-signup', 'tenant_bootstrap', p_slug,
    jsonb_build_object('seeded_for_email', v_email, 'mode', 'self-serve')
  );

  return v_tenant_id;
end
$$;

revoke execute on function public.setup_self_serve_tenant(text, text, text)
  from public, anon, authenticated;
