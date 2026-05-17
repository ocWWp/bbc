-- Phase K install-flow: add OAuth refresh + expiry fields to external_accounts.
-- Existing rows (LLM api_keys, GitHub PATs) stay valid; new columns are nullable.
-- OAuth rows (kind='oauth_token') populate all four; api_key rows leave them null.

alter table public.external_accounts
  add column refresh_ciphertext bytea,
  add column refresh_iv bytea,
  add column refresh_tag bytea,
  add column expires_at timestamptz,
  add column granted_scopes text[];

comment on column public.external_accounts.refresh_ciphertext is
  'OAuth refresh token, AES-256-GCM. Null for api_key rows.';
comment on column public.external_accounts.refresh_iv is
  'AES-256-GCM IV (12 bytes) for refresh_ciphertext. Null for api_key rows.';
comment on column public.external_accounts.refresh_tag is
  'AES-256-GCM auth tag (16 bytes) for refresh_ciphertext. Null for api_key rows.';
comment on column public.external_accounts.expires_at is
  'OAuth access-token expiry. Refresh hook trips when this passes.';
comment on column public.external_accounts.granted_scopes is
  'Scopes the user actually granted (Google may grant fewer than requested).';

notify pgrst, 'reload schema';
