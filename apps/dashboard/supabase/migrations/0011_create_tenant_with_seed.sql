-- Phase 4 migration 0011: create_tenant_with_seed
-- Bootstraps a fresh tenant with: tenant row, owner-as-admin in
-- tenant_members, seed memory_files (CLAUDE.md + _schema.md + a sample
-- ADR), seed bindings (3 unbound roles), one sample queue_items proposal.
--
-- Designed to be called from a future signup flow when the user has no
-- pending invitation.
--
-- Template content is inlined here; the canonical files live in
-- bbc/templates/initial-tenant/. Drift between this SQL and the
-- filesystem templates is expected to be checked manually when the
-- templates change (a future CI step can automate it).

create or replace function public.create_tenant_with_seed(
  p_slug text,
  p_name text,
  p_owner_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_tenant_id uuid;
  v_now       timestamptz := now();
  v_date      text := to_char(v_now at time zone 'utc', 'YYYY-MM-DD');
  v_owner_email text;
  v_owner_label text;
begin
  if p_owner_user_id is null then
    raise exception 'invalid_input: owner user id required' using errcode = 'P0006';
  end if;
  select email into v_owner_email from auth.users where id = p_owner_user_id;
  if v_owner_email is null then
    raise exception 'not_found: user does not exist' using errcode = 'P0004';
  end if;
  v_owner_label := split_part(v_owner_email, '@', 1);

  -- 1. Tenant row
  insert into public.tenants (slug, name, plan, created_by)
    values (p_slug, p_name, 'free', p_owner_user_id)
    returning id into v_tenant_id;

  -- 2. Admin membership for the owner
  insert into public.tenant_members (tenant_id, user_id, role)
    values (v_tenant_id, p_owner_user_id, 'admin');

  -- 3. Seed memory_files
  insert into public.memory_files (tenant_id, path, content, frontmatter)
  values (
    v_tenant_id,
    'CLAUDE.md',
    E'# CLAUDE.md — Main (your BBC instance)\n\nMain precedence rules and the six non-negotiable principles. See bbc/templates/initial-tenant/CLAUDE.md for the canonical seed.',
    jsonb_build_object('layer', 'main', 'owning_layer', 'main')
  );

  insert into public.memory_files (tenant_id, path, content, frontmatter)
  values (
    v_tenant_id,
    'memory/_schema.md',
    E'# Memory File Schema\n\nFrontmatter contract for every file under memory/. See bbc/templates/initial-tenant/memory/_schema.md for the canonical seed.',
    jsonb_build_object('layer', 'main', 'owning_layer', 'main', 'type', 'rule')
  );

  insert into public.memory_files (tenant_id, path, content, frontmatter)
  values (
    v_tenant_id,
    'memory/decisions/0001-bbc-tenant-bootstrap.md',
    format(E'# ADR-0001: Bootstrap this BBC instance\n\nThis BBC instance was created as a fresh tenant on %s. Seeded from bbc/templates/initial-tenant/.', v_date),
    jsonb_build_object(
      'id', 'mem_' || v_date || '_adr-0001-tenant-bootstrap',
      'type', 'decision',
      'scope', 'org',
      'layer', 'main',
      'source', 'human:' || v_owner_label,
      'created', v_now,
      'updated', v_now,
      'owning_layer', 'main',
      'tags', '["adr","bootstrap","v1"]'::jsonb,
      'status', 'accepted'
    )
  );

  -- 4. Seed bindings — three unbound roles
  insert into public.bindings (tenant_id, role, provider_id, provisional, bound_at, notes) values
    (v_tenant_id, 'db-provider',    '(unbound)', false, v_now, 'Bind when you wire your first persistent store.'),
    (v_tenant_id, 'llm-provider',   '(unbound)', false, v_now, 'Bind when you wire your first agent integration.'),
    (v_tenant_id, 'email-delivery', '(unbound)', false, v_now, 'Bind when you need transactional or marketing email.');

  -- 5. Sample queue_items proposal — demo of the propose flow
  insert into public.queue_items (tenant_id, proposal_id, status, body, frontmatter)
  values (
    v_tenant_id,
    'prop_' || replace(v_date, '-', '') || '_sample_first_proposal',
    'pending',
    E'# Sample proposal: your first real decision\n\nThis is a sample queue item shipped with every new BBC instance. Reject it and write your first real proposal.',
    jsonb_build_object(
      'proposed_by', 'human:' || v_owner_label,
      'proposed_at', v_now,
      'target_layer', 'main',
      'target_file', 'memory/decisions/0002-first-real-decision.md',
      'change_kind', 'add',
      'diff_summary', 'Sample proposal — replace this with your first real decision.',
      'source', 'BBC initial-tenant template'
    )
  );

  -- 6. operations_log entry recording the bootstrap
  insert into public.operations_log (tenant_id, v, actor, action, target, payload)
  values (
    v_tenant_id,
    1,
    'human:' || v_owner_label,
    'tenant_bootstrap',
    p_slug,
    jsonb_build_object('seeded_from', 'bbc/templates/initial-tenant/', 'template_version', '1')
  );

  return v_tenant_id;
end
$$;

-- service_role only — invoked from server-side signup flow, never directly
-- by the client. Future Phase 9 deployment of the signup endpoint will
-- call this via a Supabase Edge Function or Next.js route handler.
revoke execute on function public.create_tenant_with_seed(text, text, uuid)
  from public, anon, authenticated;
