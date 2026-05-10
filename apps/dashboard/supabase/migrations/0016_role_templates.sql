-- Phase Z.4 migration 0016: role templates per function

create table public.role_templates (
  slug          text primary key check (slug ~ '^[a-z][a-z0-9-]{1,30}$'),
  display_name  text not null,
  description   text not null default '',
  base_role     public.tenant_role not null,
  focus_areas   text[] not null default '{}',
  permission_tags text[] not null default '{}',
  is_predefined boolean not null default true,
  created_at    timestamptz not null default now()
);
alter table public.role_templates enable row level security;

create policy role_templates_authenticated_read on public.role_templates
  for select using (auth.role() = 'authenticated');

insert into public.role_templates (slug, display_name, description, base_role, focus_areas, permission_tags) values
  ('founder',     'Founder',     'Full powers + member management. Use for the small set of people who own the company brain.', 'admin',  array['everything'],                array['accept_proposals','manage_members','issue_api_keys','edit_bindings']),
  ('admin',       'Admin',       'Full powers but not necessarily a founder. Operations leads, IT.',                              'admin',  array['operations','onboarding'],   array['accept_proposals','manage_members','issue_api_keys','edit_bindings']),
  ('engineering', 'Engineering', 'Engineers who file proposals, accept changes, and edit tech-leaning memory.',                  'member', array['tech','queue','distribution'], array['accept_proposals','propose_changes']),
  ('marketing',   'Marketing',   'Marketers who own brand, voice, copy. Files proposals; accepts marketing-scoped ones.',         'member', array['voice','design','product'],   array['accept_proposals','propose_changes']),
  ('design',      'Designer',    'Designers who own the visual + UX layer. Files proposals; accepts design-scoped ones.',         'member', array['design','voice','product'],   array['accept_proposals','propose_changes']),
  ('viewer',      'Read-only',   'Stakeholders, advisors, auditors who need visibility but should not mutate state.',             'viewer', array['observability'],             array[]::text[]);

alter table public.tenant_members
  add column if not exists template_slug text references public.role_templates(slug);

update public.tenant_members
   set template_slug = case role
     when 'admin'  then 'founder'
     when 'member' then 'engineering'
     when 'viewer' then 'viewer'
   end
 where template_slug is null;

alter table public.tenant_invitations
  add column if not exists template_slug text references public.role_templates(slug);

update public.tenant_invitations
   set template_slug = case role
     when 'admin'  then 'founder'
     when 'member' then 'engineering'
     when 'viewer' then 'viewer'
   end
 where template_slug is null;

-- Update create_invitation to take a template_slug instead of a base role.
drop function if exists public.create_invitation(text, text, public.tenant_role);

create function public.create_invitation(
  p_provider text,
  p_identifier text,
  p_template_slug text default 'engineering'
)
returns uuid
language plpgsql security definer set search_path = public, auth
as $$
declare
  v_caller record; v_inv_id uuid; v_v bigint; v_id text;
  v_template public.role_templates%rowtype;
begin
  if p_provider not in ('github','google','email') then raise exception 'invalid_input: provider must be github|google|email' using errcode = 'P0006'; end if;
  if p_identifier is null or length(trim(p_identifier)) = 0 then raise exception 'invalid_input: identifier required' using errcode = 'P0006'; end if;
  select * into v_template from public.role_templates where slug = p_template_slug;
  if v_template.slug is null then raise exception 'invalid_input: unknown template_slug "%"', p_template_slug using errcode = 'P0006'; end if;

  select * into v_caller from public._require_admin();
  v_id := lower(trim(p_identifier));

  insert into public.tenant_invitations (tenant_id, provider, identifier, role, template_slug, invited_by)
    values (v_caller.out_tenant_id, p_provider, v_id, v_template.base_role, v_template.slug, v_caller.out_user_id)
    on conflict (tenant_id, provider, identifier) do update
      set role = excluded.role, template_slug = excluded.template_slug, invited_by = excluded.invited_by
    returning id into v_inv_id;

  select coalesce(max(v), 0) + 1 into v_v from public.operations_log where tenant_id = v_caller.out_tenant_id;
  insert into public.operations_log (tenant_id, v, actor, action, target, payload)
    values (v_caller.out_tenant_id, v_v, v_caller.out_actor, 'invite', p_provider || ':' || v_id,
      jsonb_build_object('provider', p_provider, 'identifier', v_id, 'template', v_template.slug, 'role', v_template.base_role::text));
  return v_inv_id;
end $$;
revoke execute on function public.create_invitation(text, text, text) from public, anon;
grant execute on function public.create_invitation(text, text, text) to authenticated;

-- Update create_profile_and_membership to persist template_slug from invitation
create or replace function public.create_profile_and_membership()
returns trigger language plpgsql security definer set search_path = public, auth
as $$
declare v_provider text; v_identifier text; v_invitation public.tenant_invitations;
begin
  v_provider := coalesce(new.raw_app_meta_data->>'provider', 'email');
  if v_provider = 'github' then v_identifier := lower(new.raw_user_meta_data->>'user_name');
  else v_identifier := lower(new.email); end if;
  select * into v_invitation from public.tenant_invitations
    where provider = v_provider and identifier = v_identifier order by created_at asc limit 1;
  if v_invitation.id is null then raise exception 'not_invited' using errcode = 'P0001'; end if;
  insert into public.profiles (user_id, tenant_id, provider, identifier, display_name, avatar_url)
    values (new.id, v_invitation.tenant_id, v_provider, v_identifier,
      new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'avatar_url');
  insert into public.tenant_members (tenant_id, user_id, role, template_slug)
    values (v_invitation.tenant_id, new.id, v_invitation.role, v_invitation.template_slug)
    on conflict (tenant_id, user_id) do nothing;
  return new;
end $$;
