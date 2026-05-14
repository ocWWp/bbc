-- Phase L+ follow-up: pin search_path on bindings_seed_default.
-- Supabase advisor flagged the trigger function as having a mutable search_path
-- (lint 0011_function_search_path_mutable). For a BEFORE INSERT trigger this is
-- low-risk because the function only references unqualified column names on
-- `new`, but pinning the search_path is cheap belt-and-suspenders and silences
-- the advisor.

create or replace function public.bindings_seed_default()
returns trigger
language plpgsql
set search_path = public, pg_temp
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
