-- Phase 2 migration 0007: operations_log + bindings + proposals_accepted/rejected
-- All immutable-or-append-only per ADR-0004 §Consequences/Governance principle 6.

-- 1. operations_log — append-only audit
create table public.operations_log (
  id           bigserial primary key,
  tenant_id    uuid not null references public.tenants(id) on delete cascade,
  v            bigint not null,
  ts           timestamptz not null default now(),
  actor        text not null,
  action       text not null,
  target       text,
  state_hash   text,
  lkg_at_emit  bigint,
  payload      jsonb not null default '{}'::jsonb
);
alter table public.operations_log enable row level security;

create unique index operations_log_tenant_v_idx on public.operations_log(tenant_id, v);
create index operations_log_recent_idx on public.operations_log(tenant_id, ts desc);

create or replace function public.block_top_level_log_mutation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if pg_trigger_depth() = 1 then
    raise exception 'operations_log is append-only'
      using errcode = 'P0001';
  end if;
  if tg_op = 'UPDATE' then return new; else return old; end if;
end
$$;
revoke execute on function public.block_top_level_log_mutation() from public, anon, authenticated;

create trigger operations_log_no_update
  before update on public.operations_log
  for each row execute function public.block_top_level_log_mutation();

create trigger operations_log_no_delete
  before delete on public.operations_log
  for each row execute function public.block_top_level_log_mutation();

create policy operations_log_member_read on public.operations_log
  for select using (public.is_member_of(tenant_id));

-- 2. bindings — role -> provider table per tenant
create table public.bindings (
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  role          text not null,
  provider_id   text not null,
  provisional   boolean not null default false,
  bound_at      timestamptz not null default now(),
  notes         text,
  primary key (tenant_id, role)
);
alter table public.bindings enable row level security;

create policy bindings_member_read on public.bindings
  for select using (public.is_member_of(tenant_id));

-- 3. proposals_accepted — immutable record of every accepted proposal
create table public.proposals_accepted (
  tenant_id      uuid not null references public.tenants(id) on delete cascade,
  proposal_id    text not null,
  accepted_at    timestamptz not null default now(),
  accepted_by    uuid references auth.users(id) on delete set null,
  hash           text,
  body           text not null,
  frontmatter    jsonb not null default '{}'::jsonb,
  primary key (tenant_id, proposal_id)
);
alter table public.proposals_accepted enable row level security;

create or replace function public.block_top_level_audit_mutation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if pg_trigger_depth() = 1 then
    raise exception '% audit rows are immutable', tg_table_name
      using errcode = 'P0001';
  end if;
  if tg_op = 'UPDATE' then return new; else return old; end if;
end
$$;
revoke execute on function public.block_top_level_audit_mutation() from public, anon, authenticated;

create trigger proposals_accepted_no_update before update on public.proposals_accepted
  for each row execute function public.block_top_level_audit_mutation();
create trigger proposals_accepted_no_delete before delete on public.proposals_accepted
  for each row execute function public.block_top_level_audit_mutation();

create policy proposals_accepted_member_read on public.proposals_accepted
  for select using (public.is_member_of(tenant_id));

-- 4. proposals_rejected — symmetric audit
create table public.proposals_rejected (
  tenant_id      uuid not null references public.tenants(id) on delete cascade,
  proposal_id    text not null,
  rejected_at    timestamptz not null default now(),
  rejected_by    uuid references auth.users(id) on delete set null,
  reason         text not null,
  body           text not null,
  frontmatter    jsonb not null default '{}'::jsonb,
  primary key (tenant_id, proposal_id)
);
alter table public.proposals_rejected enable row level security;

create trigger proposals_rejected_no_update before update on public.proposals_rejected
  for each row execute function public.block_top_level_audit_mutation();
create trigger proposals_rejected_no_delete before delete on public.proposals_rejected
  for each row execute function public.block_top_level_audit_mutation();

create policy proposals_rejected_member_read on public.proposals_rejected
  for select using (public.is_member_of(tenant_id));
