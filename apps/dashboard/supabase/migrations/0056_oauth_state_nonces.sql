-- Phase K install-flow: single-use CSRF nonces for OAuth state.
-- Each /library/install/google action inserts a nonce; the callback consumes
-- (deletes) it. Mismatch / missing / expired = reject. Service-role only.

create table public.oauth_state_nonces (
  nonce uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  actor_user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  scopes text[] not null,
  redirect_url text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index oauth_state_nonces_expires_idx on public.oauth_state_nonces(expires_at);

alter table public.oauth_state_nonces enable row level security;
-- No member policies: service-role writes from server actions; no client access.

comment on table public.oauth_state_nonces is
  'Single-use OAuth state nonces. Service-role only. See lib/connectors/oauth-nonce.ts.';

notify pgrst, 'reload schema';
