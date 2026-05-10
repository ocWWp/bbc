-- Phase Z.3 migration 0015: invitation tokens for signed invite links

create extension if not exists pgcrypto;

alter table public.tenant_invitations
  add column if not exists invitation_token uuid unique default gen_random_uuid(),
  add column if not exists consumed_at timestamptz;

update public.tenant_invitations
   set invitation_token = gen_random_uuid()
 where invitation_token is null;

create or replace function public.resolve_invitation_token(p_token uuid)
returns table(
  out_email      text,
  out_provider   text,
  out_role       public.tenant_role,
  out_tenant_slug text,
  out_tenant_name text,
  out_consumed   boolean
)
language plpgsql security definer set search_path = public, auth
as $$
declare v_inv public.tenant_invitations%rowtype; v_tnt public.tenants%rowtype;
begin
  if p_token is null then raise exception 'invalid_input: token required' using errcode = 'P0006'; end if;
  select * into v_inv from public.tenant_invitations where invitation_token = p_token;
  if v_inv.id is null then raise exception 'not_found: invalid or expired invitation token' using errcode = 'P0004'; end if;
  select * into v_tnt from public.tenants where id = v_inv.tenant_id;
  if v_tnt.id is null then raise exception 'not_found: tenant no longer exists' using errcode = 'P0004'; end if;
  out_email := v_inv.identifier;
  out_provider := v_inv.provider;
  out_role := v_inv.role;
  out_tenant_slug := v_tnt.slug;
  out_tenant_name := v_tnt.name;
  out_consumed := v_inv.consumed_at is not null;
  return next;
end $$;
revoke execute on function public.resolve_invitation_token(uuid) from public, anon, authenticated;

create or replace function public.consume_invitation_token(p_token uuid)
returns void language plpgsql security definer set search_path = public, auth
as $$
begin
  update public.tenant_invitations set consumed_at = now()
   where invitation_token = p_token and consumed_at is null;
end $$;
revoke execute on function public.consume_invitation_token(uuid) from public, anon, authenticated;
