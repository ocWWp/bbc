-- 0062 — Lock down notify_connector_broken() execute grants.
--
-- 0061 created public.notify_connector_broken() as SECURITY DEFINER.
-- Supabase default ACL grants EXECUTE on every new function in public
-- to {anon, authenticated, service_role}. Linter rightly flagged this:
-- a SECURITY DEFINER function reachable via PostgREST /rpc/ by anon
-- is a privilege-escalation smell — even though calling this one
-- without a NEW row would just error.
--
-- This function is a trigger function. It is invoked by the DB engine
-- on tenant_connectors UPDATE; it does NOT need any role EXECUTE
-- grant to fire. Revoking from PUBLIC, anon, authenticated does NOT
-- break the trigger.
--
-- Same lockdown pattern as 0058_install_connector_atomic_lockdown.sql.

REVOKE EXECUTE ON FUNCTION public.notify_connector_broken() FROM PUBLIC, anon, authenticated;
