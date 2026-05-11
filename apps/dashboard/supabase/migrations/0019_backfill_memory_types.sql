-- 0019_backfill_memory_types.sql
-- Phase H: classify existing memory_files rows into typed supertags based on path.
--
-- Path conventions from `examples/example-tenant/memory/` are the source of truth
-- for this mapping. Anything that doesn't match stays type=NULL and needs manual triage.

update public.memory_files
set
  type   = case
    when path like 'memory/design/voice%'         then 'voice'::memory_type
    when path like 'memory/decisions/%'           then 'decision'::memory_type
    when path like 'memory/glossary/%'            then 'glossary'::memory_type
    when path like 'memory/ops/vendors%'
      or path like 'memory/ops/providers/%'       then 'vendor'::memory_type
    when path like 'memory/people/%'              then 'team'::memory_type
    when path like 'memory/skills/%'              then 'skill'::memory_type
    when path like 'memory/product/%'             then 'product'::memory_type
    else null
  end,
  title  = coalesce(frontmatter->>'title', regexp_replace(path, '^.*/', '')),
  slug   = lower(regexp_replace(regexp_replace(path, '^.*/', ''), '\.(md|yaml)$', '')),
  status = case
    when frontmatter->>'status' = 'active'   then 'active'::memory_status
    when frontmatter->>'status' = 'archived' then 'archived'::memory_status
    else 'draft'::memory_status
  end
where type is null;
