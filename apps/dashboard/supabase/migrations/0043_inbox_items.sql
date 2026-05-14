-- Migration 0043: inbox_items
-- Per-user notification rows. Two channels at v1.5:
--   * from_bbc — admin replies to user-filed flag proposals + Loop-3 items
--     surfaced to this user (gated by tenants.loop3_teammate_visibility).
--   * mentions — placeholder channel; no producer in v1.5, no badge contribution.
--
-- RLS lifecycle:
--   SELECT: only the row's user_id sees their inbox; must also be a tenant member.
--   UPDATE: only the owner, and the read_at-only trigger enforces that ONLY read_at
--           may change — body/title/source links are immutable from the client.
--   INSERT: no member-level policy on purpose — inserts come from the service role
--           (queue resolution hook, Loop-3 fan-out). Adding mention insertion later
--           would add a new policy explicitly.
--   DELETE: not allowed at the RLS layer.

create table public.inbox_items (
  id                       uuid primary key default gen_random_uuid(),
  tenant_id                uuid not null references public.tenants(id) on delete cascade,
  user_id                  uuid not null references auth.users(id) on delete cascade,
  channel                  text not null check (channel in ('mentions', 'from_bbc')),
  kind                     text not null,
  title                    text not null,
  body                     text,
  source_kind              text check (source_kind in ('queue_item', 'recommendation', 'memory_file') or source_kind is null),
  source_queue_item_id     uuid references public.queue_items(id) on delete set null,
  source_recommendation_id uuid references public.recommendations(id) on delete set null,
  source_memory_id         uuid references public.memory_files(id) on delete set null,
  flagger_user_id          uuid references auth.users(id) on delete set null,
  read_at                  timestamptz,
  created_at               timestamptz not null default now()
);

create index inbox_items_user_channel_unread_idx
  on public.inbox_items (user_id, channel, read_at, created_at desc);

create index inbox_items_tenant_user_idx
  on public.inbox_items (tenant_id, user_id, created_at desc);

alter table public.inbox_items enable row level security;

create policy inbox_items_owner_select on public.inbox_items
  for select using (user_id = auth.uid() and public.is_member_of(tenant_id));

create policy inbox_items_owner_update on public.inbox_items
  for update using (user_id = auth.uid() and public.is_member_of(tenant_id))
  with check (user_id = auth.uid() and public.is_member_of(tenant_id));

create or replace function public.inbox_items_only_read_at_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if  (old.tenant_id is distinct from new.tenant_id)
   or (old.user_id is distinct from new.user_id)
   or (old.channel is distinct from new.channel)
   or (old.kind is distinct from new.kind)
   or (old.title is distinct from new.title)
   or (old.body is distinct from new.body)
   or (old.source_kind is distinct from new.source_kind)
   or (old.source_queue_item_id is distinct from new.source_queue_item_id)
   or (old.source_recommendation_id is distinct from new.source_recommendation_id)
   or (old.source_memory_id is distinct from new.source_memory_id)
   or (old.flagger_user_id is distinct from new.flagger_user_id)
   or (old.created_at is distinct from new.created_at)
  then
    raise exception 'inbox_items: only read_at may be updated by the owner';
  end if;
  return new;
end
$$;

create trigger inbox_items_lock_fields
  before update on public.inbox_items
  for each row execute function public.inbox_items_only_read_at_changes();

-- No INSERT policy — inserts only via service-role context. Adding a
-- mention-insertion path later (e.g. comment producer) means a new
-- explicit policy here.

comment on table public.inbox_items is
  'Per-user notification rows. Two channels in v1.5: from_bbc (flag resolutions + Loop-3 fan-out) and mentions (no producer yet). Inserts service-role only; updates lock all fields except read_at via trigger.';
