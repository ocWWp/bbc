-- Phase I.20 migration 0022: extend memory_type enum.
-- Adds two new supertags introduced in I.20:
--   source_artifact -- the source itself is the memory (e.g. "this README is our brand guide")
--   note            -- free-form escape valve when no typed supertag fits
-- See docs/plans/2026-05-11-phase-i20-multi-source-ingestion.md task I.20.11.

alter type public.memory_type add value if not exists 'source_artifact';
alter type public.memory_type add value if not exists 'note';
