-- Phase L1.1 follow-up: seed default llm-provider binding on tenant creation.
--
-- Before this migration, every new tenant got an `(unbound)` row for the
-- `llm-provider` role from setup_self_serve_tenant / create_tenant_with_seed.
-- That meant Phase L1's resolveRoleTool("llm-provider") always returned null
-- in DB-mode -- Studio fell back to the hardcoded constant and the tenant
-- saw no benefit from the role-tool-bundle catalog until they manually bound
-- a provider at /bindings.
--
-- This migration installs a BEFORE INSERT trigger on `bindings` that rewrites
-- (role='llm-provider', provider_id='(unbound)') to the catalog's default
-- (anthropic-claude-sonnet). It also backfills existing tenants the same way.
--
-- Why a trigger instead of rewriting the seed functions:
--   - setup_self_serve_tenant and create_tenant_with_seed are ~100 lines each;
--     rewriting them risks subtle regressions.
--   - The trigger captures every code path that inserts into bindings, not
--     just the two seed functions.
--
-- Users who want a different default can change the binding at /bindings;
-- the trigger only fires on the literal '(unbound)' sentinel.

create or replace function public.bindings_seed_default()
returns trigger
language plpgsql
as $$
begin
  if new.role = 'llm-provider' and new.provider_id = '(unbound)' then
    new.provider_id := 'anthropic-claude-sonnet';
    new.notes := coalesce(new.notes, '') ||
      ' [default seeded; change at /bindings]';
  end if;
  return new;
end
$$;

drop trigger if exists bindings_seed_default_before_insert on public.bindings;
create trigger bindings_seed_default_before_insert
  before insert on public.bindings
  for each row execute function public.bindings_seed_default();

-- Backfill: tenants created before this migration have llm-provider unbound.
-- Flip them to the catalog default. Idempotent -- safe to re-run.
update public.bindings
set provider_id = 'anthropic-claude-sonnet',
    notes = coalesce(notes, '') || ' [default seeded by 0028 backfill]'
where role = 'llm-provider'
  and provider_id = '(unbound)';
