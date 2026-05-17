-- PR-C M1 (v1.7): home_sessions.title + backfill + rail index.
--
-- The /home chat history sidebar (PR-C) needs a per-session display label.
-- We derive a session's title from its FIRST user turn — first ~40 chars of
-- the user's opening message, whitespace-normalized. The column is nullable
-- so brand-new sessions (no turns yet) keep a NULL title and the UI can fall
-- back to a placeholder like "New chat".
--
-- The backfill below populates titles for every existing session that already
-- has at least one user turn. v1.6 introduced stub agent turns (role='agent',
-- pre-streaming placeholder); we filter `role='user'` so stubs never become
-- titles. We also guard against empty/whitespace-only text via the trimmed
-- length check.
--
-- The rail index supports the listSessions query in apps/dashboard/src/lib/home/sessions.ts,
-- which filters by (tenant_id, user_id) where archived_at IS NULL and orders by
-- last_activity_at DESC. The existing home_sessions_tenant_user_active_idx
-- indexes (tenant_id, user_id, archived_at) but doesn't sort on
-- last_activity_at — the new partial index makes the rail query an index-only
-- range scan.

alter table public.home_sessions
  add column if not exists title text;

-- One-time backfill: pull the first user turn per session, trim + collapse
-- whitespace, truncate to 40 chars.
update public.home_sessions s
set title = sub.derived_title
from (
  select distinct on (t.session_id)
    t.session_id,
    left(
      regexp_replace(
        trim(both from (t.content_jsonb->>'text')),
        '\s+',
        ' ',
        'g'
      ),
      40
    ) as derived_title
  from public.home_turns t
  where t.role = 'user'
    and t.content_jsonb ? 'text'
    and length(trim(both from (t.content_jsonb->>'text'))) > 0
  order by t.session_id, t.created_at asc
) sub
where s.id = sub.session_id
  and s.title is null;

create index if not exists home_sessions_tenant_user_last_activity_idx
  on public.home_sessions (tenant_id, user_id, last_activity_at desc)
  where archived_at is null;
