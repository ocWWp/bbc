-- Migration 0044: inbox_items — external producer support
--
-- Extends inbox_items so external integrations (Slack, Gmail, Linear, GitHub)
-- can fan @mentions / assignments into the `mentions` channel.
--
-- IMPORTANT — this is the NOTIFICATION path, not ingestion. The existing
-- connector framework (apps/dashboard/src/lib/connectors/*) fans external
-- CONTENT into memory_files as draft proposals (Loop 1). This migration is the
-- parallel notification path: external EVENTS about the user — "you were
-- @mentioned", "an issue was assigned to you" — become inbox_items rows in the
-- `mentions` channel. Different feature, overlapping external APIs.
--
-- What changes:
--   * source_kind CHECK gains 'slack' | 'email' | 'linear' | 'github'
--   * two generic external-source columns — external rows have no internal
--     referent, so no per-producer FK columns (single-table, per
--     project_v16_inbox_external memory)
--   * the field-lock trigger is updated to also lock the new columns
--   * a partial unique index makes external inserts idempotent — a producer
--     re-running a sync must not double-post the same event
--
-- Inserts stay service-role only (external producers run server-side via
-- getSupabaseServiceClient). No new INSERT policy — same posture as 0043.

-- 1. Widen source_kind to cover external producers.
alter table public.inbox_items
  drop constraint if exists inbox_items_source_kind_check;

alter table public.inbox_items
  add constraint inbox_items_source_kind_check
  check (
    source_kind in (
      'queue_item', 'recommendation', 'memory_file',
      'slack', 'email', 'linear', 'github'
    )
    or source_kind is null
  );

-- 2. Generic external-source columns. No FK — the referent lives in another
--    system. source_external_id is the stable upstream id (Slack channel:ts,
--    Linear issue id, GitHub PR node id, RFC822 Message-ID). source_external_url
--    is the deep link the inbox row renders as "open in <tool>".
alter table public.inbox_items
  add column source_external_id  text,
  add column source_external_url text;

comment on column public.inbox_items.source_external_id is
  'Stable upstream id for external-producer rows (e.g. slack:<channel>:<ts>). Null for internal rows. Used for insert idempotency.';
comment on column public.inbox_items.source_external_url is
  'Deep link back to the originating external item. Null for internal rows.';

-- 3. Idempotency — a producer re-running an incremental sync must not
--    double-post the same external event to the same user.
create unique index inbox_items_external_dedup_idx
  on public.inbox_items (tenant_id, user_id, source_kind, source_external_id)
  where source_external_id is not null;

-- 4. Lock the new columns in the read_at-only update trigger. The trigger
--    function is replaced; the trigger itself (inbox_items_lock_fields) keeps
--    pointing at it.
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
   or (old.source_external_id is distinct from new.source_external_id)
   or (old.source_external_url is distinct from new.source_external_url)
   or (old.flagger_user_id is distinct from new.flagger_user_id)
   or (old.created_at is distinct from new.created_at)
  then
    raise exception 'inbox_items: only read_at may be updated by the owner';
  end if;
  return new;
end
$$;

comment on table public.inbox_items is
  'Per-user notification rows. Channels: from_bbc (flag resolutions + Loop-3 fan-out) and mentions (internal future-mentions + external producers — Slack/email/Linear/GitHub — added in 0044). Inserts service-role only; updates lock all fields except read_at via trigger.';
