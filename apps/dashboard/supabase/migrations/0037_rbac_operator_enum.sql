-- v1.5 launch polish: RBAC — add 'operator' to tenant_role enum.
--
-- Per ADR-0012 (memory/decisions/0012-rbac-permission-scopes.md).
-- Split into two migrations (0037 + 0038) because Postgres rejects
-- ALTER TYPE ... ADD VALUE followed by DML that references the new
-- value inside a single transaction ("unsafe use of new value of
-- enum type"). 0037 commits the enum value; 0038 migrates data and
-- rewrites RLS policies.

alter type public.tenant_role add value if not exists 'operator';
