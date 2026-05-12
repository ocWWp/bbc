-- Phase L+ follow-up: expand the default-bindings seeder to cover more roles.
--
-- Migration 0028 introduced the BEFORE INSERT trigger that rewrites
-- (role='llm-provider', provider_id='(unbound)') to 'anthropic-claude-sonnet'.
-- That handled the one role that was actually blocking Studio runs.
--
-- This migration extends the trigger to handle the rest of the role set the
-- file-mode bindings.yaml documents as default-bound:
--
--   db-provider          -> supabase            (DB-mode IS supabase anyway)
--   hosting-provider     -> cloudflare-workers  (the only deployable target wired today)
--   email-delivery       -> resend              (matches file-mode default)
--   analytics-provider   -> posthog             (provisional; tenants override)
--
-- Plus a backfill UPDATE for existing tenants. Idempotent — only flips rows
-- where provider_id is still the '(unbound)' sentinel.
--
-- Note: web-host, api-host, image-edit-provider, video-gen-provider stay
-- intentionally unbound. Cloudflare Workers covers the dashboard host; api-host
-- is leaf-specific (8azi-api uses Railway); image/video are not wired anywhere
-- yet so '(unbound)' is the honest state.

create or replace function public.bindings_seed_default()
returns trigger
language plpgsql
as $$
declare
  v_default text;
begin
  v_default := case new.role
    when 'llm-provider' then 'anthropic-claude-sonnet'
    when 'db-provider' then 'supabase'
    when 'hosting-provider' then 'cloudflare-workers'
    when 'email-delivery' then 'resend'
    when 'analytics-provider' then 'posthog'
    else null
  end;

  if v_default is not null and new.provider_id = '(unbound)' then
    new.provider_id := v_default;
    new.notes := coalesce(new.notes, '') ||
      ' [default seeded; change at /bindings]';
  end if;
  return new;
end
$$;

-- Backfill: any existing '(unbound)' rows for the expanded role set flip to
-- the catalog default. Safe to re-run.
update public.bindings
set provider_id = case role
      when 'llm-provider'        then 'anthropic-claude-sonnet'
      when 'db-provider'         then 'supabase'
      when 'hosting-provider'    then 'cloudflare-workers'
      when 'email-delivery'      then 'resend'
      when 'analytics-provider'  then 'posthog'
      else provider_id
    end,
    notes = coalesce(notes, '') || ' [default seeded by 0029 backfill]'
where role in (
        'llm-provider',
        'db-provider',
        'hosting-provider',
        'email-delivery',
        'analytics-provider'
      )
  and provider_id = '(unbound)';
