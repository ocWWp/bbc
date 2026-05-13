-- v1.5 launch polish (Task 0d): propose_change() RPC.
--
-- DB-mode equivalent of file-mode `scripts/propose.sh`. Any tenant member
-- (admin / operator / member / viewer) may file a proposal; only operators
-- can accept/reject (per ADR-0012 + 0039_rbac_rpc_gates).
--
-- Writes to queue_items.body + queue_items.frontmatter (jsonb). The
-- frontmatter shape mirrors the YAML emitted by scripts/propose.sh so the
-- two storage modes produce queue items that are operationally identical:
--   proposal_id, proposed_by, proposed_at, target_layer, target_file,
--   change_kind, diff_summary, source, source_memory_id.
--
-- change_kind accepts the existing four values plus 'flag', which is the
-- new value introduced for the v1.5 "Flag this memory" affordance (a member
-- raises concerns about a memory row without proposing a specific edit).

create or replace function public.propose_change(
  p_tenant_id        uuid,
  p_target_file      text,
  p_change_kind      text,
  p_summary          text,
  p_body             text,
  p_source_memory_id uuid default null,
  p_target_layer     text default 'main'
) returns text
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user        uuid := auth.uid();
  v_profile     public.profiles%rowtype;
  v_actor       text;
  v_slug        text;
  v_proposal_id text;
  v_frontmatter jsonb;
begin
  if v_user is null then
    raise exception 'unauthorized: sign in required' using errcode = 'P0002';
  end if;

  if not public.is_member_of(p_tenant_id) then
    raise exception 'forbidden: not a member of tenant' using errcode = 'P0003';
  end if;

  if p_change_kind not in ('edit', 'add', 'supersede', 'archive', 'flag') then
    raise exception 'invalid_input: change_kind must be edit|add|supersede|archive|flag'
      using errcode = 'P0006';
  end if;

  if p_target_layer not in ('main', 'manager') then
    raise exception 'invalid_input: target_layer must be main|manager'
      using errcode = 'P0006';
  end if;

  if p_summary is null or length(trim(p_summary)) = 0 then
    raise exception 'invalid_input: summary required' using errcode = 'P0006';
  end if;
  if length(p_summary) > 500 then
    raise exception 'invalid_input: summary exceeds 500 chars' using errcode = 'P0006';
  end if;

  -- Derive the actor string the same way scripts/propose.sh does, from the
  -- user's profile row (provider:identifier). Falls back to user_id when the
  -- profile row is missing.
  select * into v_profile from public.profiles where user_id = v_user;
  if v_profile.user_id is null then
    v_actor := 'user:' || v_user::text;
  else
    v_actor := 'human:' || v_profile.provider || ':' || v_profile.identifier;
  end if;

  -- Slug: same shape scripts/propose.sh produces — lowercase kebab, ≤ 40 chars.
  v_slug := lower(p_summary);
  v_slug := regexp_replace(v_slug, '[^a-z0-9]+', '-', 'g');
  v_slug := regexp_replace(v_slug, '^-+|-+$', '', 'g');
  v_slug := substring(v_slug from 1 for 40);

  v_proposal_id := format(
    'prop_%s_dashboard_%s',
    to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24-MI-SS"Z"'),
    v_slug
  );

  -- Frontmatter mirrors the YAML shape scripts/propose.sh writes.
  v_frontmatter := jsonb_build_object(
    'proposal_id',      v_proposal_id,
    'proposed_by',      v_actor,
    'proposed_at',      to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'target_layer',     p_target_layer,
    'target_file',      p_target_file,
    'change_kind',      p_change_kind,
    'diff_summary',     p_summary,
    'source',           'dashboard',
    'source_memory_id', p_source_memory_id
  );

  insert into public.queue_items (tenant_id, proposal_id, status, body, frontmatter)
  values (p_tenant_id, v_proposal_id, 'pending'::public.queue_status, p_body, v_frontmatter);

  return v_proposal_id;
end
$$;

revoke execute on function public.propose_change(uuid, text, text, text, text, uuid, text) from public, anon;
grant execute on function public.propose_change(uuid, text, text, text, text, uuid, text) to authenticated;
