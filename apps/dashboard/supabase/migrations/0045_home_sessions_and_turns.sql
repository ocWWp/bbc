-- M2 (v1.6): /home chat shell persistence.
--
-- home_sessions is the per-user conversation thread on /home.
-- home_turns is the append-only sequence of user + agent turns inside a session.
--
-- Status lifecycle on home_turns: 'in_progress' (assistant streaming) →
-- 'completed' (final SSE turn-end), 'aborted' (user cancel), or 'failed' (server error).
-- The status column lets a page refresh mid-stream show "interrupted turn" instead of
-- a partial-text turn that looks intentional.
--
-- RLS pattern follows the rest of the codebase (is_member_of / is_operator_of).
-- Sessions are scoped per-user inside a tenant; turns inherit visibility from the
-- parent session.

create table public.home_sessions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  started_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now(),
  archived_at timestamptz
);

alter table public.home_sessions enable row level security;

-- Members see only their own sessions inside a tenant they belong to.
create policy home_sessions_select on public.home_sessions
  for select using (
    public.is_member_of(tenant_id) and user_id = auth.uid()
  );

create policy home_sessions_insert on public.home_sessions
  for insert with check (
    public.is_member_of(tenant_id) and user_id = auth.uid()
  );

create policy home_sessions_update on public.home_sessions
  for update using (
    public.is_member_of(tenant_id) and user_id = auth.uid()
  ) with check (
    public.is_member_of(tenant_id) and user_id = auth.uid()
  );

create table public.home_turns (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.home_sessions(id) on delete cascade,
  role text not null check (role in ('user', 'agent')),
  status text not null default 'completed'
    check (status in ('in_progress', 'completed', 'aborted', 'failed')),
  content_jsonb jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  finalized_at timestamptz
);

alter table public.home_turns enable row level security;

create policy home_turns_select on public.home_turns
  for select using (
    exists (
      select 1 from public.home_sessions s
      where s.id = home_turns.session_id
        and public.is_member_of(s.tenant_id)
        and s.user_id = auth.uid()
    )
  );

create policy home_turns_insert on public.home_turns
  for insert with check (
    exists (
      select 1 from public.home_sessions s
      where s.id = home_turns.session_id
        and public.is_member_of(s.tenant_id)
        and s.user_id = auth.uid()
    )
  );

create policy home_turns_update on public.home_turns
  for update using (
    exists (
      select 1 from public.home_sessions s
      where s.id = home_turns.session_id
        and public.is_member_of(s.tenant_id)
        and s.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.home_sessions s
      where s.id = home_turns.session_id
        and public.is_member_of(s.tenant_id)
        and s.user_id = auth.uid()
    )
  );

create index home_sessions_tenant_user_active_idx
  on public.home_sessions(tenant_id, user_id, archived_at);
create index home_turns_session_created_idx
  on public.home_turns(session_id, created_at);
