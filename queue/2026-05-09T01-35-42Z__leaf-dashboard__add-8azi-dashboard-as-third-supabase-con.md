---
proposal_id: prop_2026-05-09T01-35-42Z_leaf-dashboard_add-8azi-dashboard-as-third-supabase-con
proposed_by: leaf:dashboard
proposed_at: 2026-05-09T01:35:42Z
target_layer: main
target_file: memory/ops/providers/supabase.yaml
change_kind: edit
diff_summary: "Add 8azi-dashboard as third Supabase consumer (auth via Supabase Auth)"
source: "Dashboard Supabase Auth migration, 2026-05-08 (project gpmtkhyczbapnfquhswn)"
status: pending
---

```diff
--- a/memory/ops/providers/supabase.yaml
+++ b/memory/ops/providers/supabase.yaml
@@ -31,8 +31,9 @@
 - auth:
   - service-role key (server-side, full access)
   - anon key (client-side, RLS-gated)
 - consumer-side SDK:
   - 8azi-api/app/  (supabase-py)
   - 8azi-web/      (@supabase/supabase-js)
+  - 8azi-dashboard/ (@supabase/ssr + @supabase/supabase-js)
 - official sdk: @supabase/supabase-js / supabase (pypi)

@@ -55,4 +56,4 @@

 ## Notes

-8azi V1 bundles auth with db (Supabase combines them). RLS policies are the primary access control mechanism. The cross-repo Nayin lookup (`nayin-cross-repo-sync.test.ts`) is enforced separately and does not depend on this adapter — it's a build-time check.
+8azi V1 bundles auth with db (Supabase combines them). RLS policies are the primary access control mechanism. As of 2026-05-08 there are three consumers: 8azi-api, 8azi-web, and 8azi-dashboard (the latter uses Supabase Auth for GitHub OAuth + Google OAuth + email/password, gated by a `public.allowlist` table — separate Supabase project from 8azi-api/8azi-web). The cross-repo Nayin lookup (`nayin-cross-repo-sync.test.ts`) is enforced separately and does not depend on this adapter — it's a build-time check.
```
