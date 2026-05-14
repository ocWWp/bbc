-- v1.5 launch polish (Task 0e): marketing template_id prefix backfill.
--
-- Asymmetry codex review caught: every studio role's templates carry a role
-- prefix (`eng:adr-draft`, `founder:weekly-recap`, `design:visual-spec`,
-- `support:bug-ack`) — except marketing, whose templates were unprefixed
-- (`tweet-thread`, `blog-post-draft`, etc.). `templateIdsForRole("marketing")`
-- would have returned zero rows.
--
-- Fix: backfill the marketing prefix into existing studio_runs rows so the
-- helper can use a single `like` pattern per role. Idempotent — only updates
-- rows whose template_id matches one of the known unprefixed marketing ids
-- (no colon, exact match against the locked-in list below).
--
-- The locked list MUST stay in sync with apps/dashboard/src/lib/studio/templates/.
-- Adding a marketing template later: drop it in already prefixed
-- (`marketing:<new-id>`), no migration needed.

update public.studio_runs
  set template_id = 'marketing:' || template_id
  where template_id !~ ':'
    and template_id in (
      'tweet-thread',
      'linkedin-announcement',
      'blog-post-draft',
      'reel-script',
      'single-x-post',
      'threads-post',
      'hashtag-strategy',
      'cross-platform-campaign',
      'custom',
      'voice-consistency-check'
    );

-- Mirror the same backfill onto studio_template_overrides — overrides are
-- keyed by template_id, so unprefixed override rows would silently miss
-- their templates after the code change lands.
update public.studio_template_overrides
  set template_id = 'marketing:' || template_id
  where template_id !~ ':'
    and template_id in (
      'tweet-thread',
      'linkedin-announcement',
      'blog-post-draft',
      'reel-script',
      'single-x-post',
      'threads-post',
      'hashtag-strategy',
      'cross-platform-campaign',
      'custom',
      'voice-consistency-check'
    );
