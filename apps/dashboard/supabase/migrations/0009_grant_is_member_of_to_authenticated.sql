-- Phase 3 bug fix: RLS policies on queue_items, profiles, tenants, etc.
-- call is_member_of() to gate reads. authenticated users need EXECUTE on
-- the function for those policies to evaluate at all.
--
-- The function is safe to expose to authenticated: it only reveals "is
-- auth.uid() a member of this tenant?" — information the user already
-- has access to via their session.
--
-- This was missed in 0003 (where is_member_of was revoked from authenticated
-- by reflex). Surfaced when the Phase 3 accept_proposal smoke test triggered
-- RLS policy evaluation under the authenticated role.

grant execute on function public.is_member_of(uuid) to authenticated;
