-- Phase 2 migration 0006: queue_items
-- Per-tenant proposal queue. status flips between pending/accepted/rejected;
-- DELETE is blocked (proposals are append-only — resolutions move, never delete).

create type public.queue_status as enum ('pending', 'accepted', 'rejected');

create table public.queue_items (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references public.tenants(id) on delete cascade,
  proposal_id        text not null,
  status             public.queue_status not null default 'pending',
  body               text not null,
  frontmatter        jsonb not null default '{}'::jsonb,
  manager_review     jsonb,
  cross_leaf_impact  jsonb,
  promotion_check    jsonb,
  reject_reason      text,
  created_at         timestamptz not null default now(),
  resolved_at        timestamptz,
  unique (tenant_id, proposal_id)
);
alter table public.queue_items enable row level security;

create index queue_items_status_idx on public.queue_items(tenant_id, status, created_at desc);

-- Block top-level DELETE: proposals are append-only.
-- pg_trigger_depth() = 1 means the DELETE is a direct user action, not a
-- cascade from tenants — those are allowed (tenant deletion needs to clean up).
create or replace function public.block_top_level_queue_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if pg_trigger_depth() = 1 then
    raise exception 'queue_items rows are append-only; flip status instead of deleting'
      using errcode = 'P0001';
  end if;
  return old;
end
$$;
revoke execute on function public.block_top_level_queue_delete() from public, anon, authenticated;

create trigger queue_items_no_delete
  before delete on public.queue_items
  for each row execute function public.block_top_level_queue_delete();

-- Reads: members see their tenant's queue.
create policy queue_items_member_read on public.queue_items
  for select using (public.is_member_of(tenant_id));
