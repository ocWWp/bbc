---
id: decision_0012_rbac-permission-scopes
type: decision
scope: org
layer: main
owning_layer: main
created: 2026-05-13T00:00:00Z
updated: 2026-05-13T22:18:00Z
status: proposed
tags: [adr, rbac, tenant-role, auth, security, v1.5]
supersedes: []
superseded_by: []
provenance: [prop_2026-05-13T22-14-00Z_leaf-dashboard_adr-0012-split-tenant-members-role-membe]
---

# ADR-0012: Split `tenant_members.role` "member" into "operator" + "member"

> **Note on numbering:** the v1.5 launch-polish plan (`docs/plans/2026-05-13-v1.5-launch-polish.md`) was drafted referring to this ADR as "0010". The plan was written before 0010-retrieval-forward-only and 0011-skill-md-bbc-spec landed. This is the same ADR, renumbered to the next free slot.

## Status

**Proposed.** Lands as part of v1.5 launch polish (`docs/plans/2026-05-13-v1.5-launch-polish.md` Stage 0 Task 0a). Required for the persona-aware nav design (`docs/plans/2026-05-13-bbc-persona-nav-design.md`) to actually authorize, not just hide.

## Context

`tenant_members.role` is the Postgres ENUM `public.tenant_role` defined in `apps/dashboard/supabase/migrations/0003_tenant_model.sql` with values `('admin', 'member', 'viewer')`. The dashboard layer maps "member" to **full editor**: existing RLS policies (`0026_memory_files_write_policies.sql`) grant member-role users INSERT/UPDATE/DELETE on `memory_files`, and the `accept_proposal()` / `reject_proposal()` RPCs (`0008_write_path_functions.sql`) require only `is_member_of(tenant_id)`.

The v1.5 design introduces a persona-aware nav: teammates invited to a tenant see a stripped-down 3-route UI (`/studio/<role>`, `/brain` read-only, `/inbox`) while admins keep the full surface (`/home`, `/memory` editable, `/queue`, `/library`, `/settings`). The original plan implemented this by **hiding nav entries based on `actor.template_slug`** — but hiding nav is not authorization. A teammate with `role='member'` still holds full RLS write power on memory, can POST to `/memory/<id>` server actions, can call `accept_proposal()` directly, and can hit `/queue` / `/library` / `/settings/keys` by typing the URL.

Codex review (R1, ~1M tokens against the live repo) caught this as the headline structural gap: **nav hiding ≠ authorization**. Page-level GET guards and RLS rewrites are the contract; nav is just UX.

## Decision

Introduce a new enum value, `operator`, ranked between `admin` and `member`:

| Role | Nav | Memory | Queue | Library | Settings | Studio |
|---|---|---|---|---|---|---|
| `admin` | Full | Read + write | Accept / reject | Browse + install | Tenant + team + keys | Run any |
| `operator` | Full | Read + write | Accept / reject | Browse + install | Keys + own profile | Run any |
| `member` (new) | Studio + /brain + /inbox | Read-only via `/brain` | Cannot accept/reject; can file `propose_change` proposals | Inbox surface only (no /library page) | Own profile only | Run own role's Studio |
| `viewer` | Studio + /brain + /inbox | Read-only | Same as member | Same as member | Own profile only | Run own role's Studio |

**Migration semantics:** every existing `member` row migrates to `operator` so live tenants keep their current write power. `member` becomes the new read-only-plus-propose role for invited teammates created from the team-management UI. `viewer` is treated as identical to the new `member` for v1.5 (no UI currently creates viewers; documented for future cleanup).

**Authorization is enforced at three layers, ranked by strength:**

1. **RLS (security boundary)** — `memory_files` write policies require `is_operator_of(tenant_id)`. `accept_proposal()` / `reject_proposal()` check `is_operator_of()`. `recommendations` UPDATE requires `is_operator_of()`. SELECT policies on `recommendations` additionally consult the per-tenant `loop3_teammate_visibility` flag (ADR-0009 / Task 0g).
2. **Server actions (defense in depth)** — every `requireRole(actor, "member")` callsite that should be operator-only bumps to `requireRole(actor, "operator")`. The `Role` rank becomes `admin (3) > operator (2) > member (1) > viewer (0)`.
3. **Page-level guards (UX)** — server-component GETs on `/memory`, `/memory/[id]`, `/queue`, `/library`, `/settings/keys`, `/settings/team` call `requireRole(actor, "operator")` (or `"admin"` for `/settings/team`) and redirect non-eligible users to `/brain` or `/auth/signin`.

**`is_operator_of(p_tenant_id uuid)` helper** is a new SECURITY DEFINER function mirroring the hardening of the existing `is_member_of()`: `set search_path = public, auth`, execute revoked from `public, anon, authenticated`. It returns true if the calling user has `role in ('admin', 'operator')` in that tenant.

### Rejected alternatives

**Separate `tenant_member_permissions` table.** Considered: a row-per-capability join table (e.g. `(tenant_id, user_id, capability)` with capabilities like `memory.write`, `queue.accept`, `loop3.dismiss`). Rejected for v1.5 launch — too much surface for one ship, and the four tiers (admin / operator / member / viewer) already partition the v1.5 capability set cleanly. Revisit when a real customer asks for capability splitting inside the operator tier.

**Capability-per-feature feature flags.** Considered: per-feature flags on the user row (`can_edit_memory`, `can_accept_queue`, etc.). Rejected — permission sprawl. Adding a new feature would require thinking about who can use it across N flags instead of mapping it to one of four roles.

**Keep `member` as full editor; gate the new teammate via a separate `template_slug`-based check.** Rejected by codex review R1: it leaks. Any direct RLS call or server-action POST bypasses a template-slug-only check; only an enum-level role split changes who Postgres lets through.

## Consequences

### What this enables
- Invited teammates can be granted scoped access without giving up the tenant's existing write power.
- The persona-aware nav has an actual authorization spine to attach to.
- Future per-member Loop 3 scoping (Phase N, per ADR-0009) inherits the operator/member split.

### What this costs
- One enum migration (cannot be done in the same transaction as data UPDATE / RLS rewrite due to Postgres's "unsafe use of new value" rule — see migration plan below).
- Audit of every `requireRole(..., "member")` callsite. Codex grep against `apps/dashboard/src` returned a small set; bump each that should be operator-only.
- All `memory_files` write RLS policies replaced; existing `memory_files_member_*` policies dropped and re-created against `is_operator_of()`.
- Page-level GET guards must be added; missing one is a silent UX bug (page renders but actions fail with `forbidden`).
- Database types regenerated (`apps/dashboard/src/lib/supabase/database.types.ts` gains `"operator"` in the `tenant_role` enum union).

### Compatibility
- **Live tenants:** zero functional change. All existing `member` rows migrate to `operator`; existing UI and server actions still work because operator is ranked at the same level member is today.
- **New invitations:** the team-management UI (Task 0a sub-audit) chooses `member` by default for invited teammates created after this lands.
- **API tokens / API keys:** `api_keys.role` is unaffected (different scope; per `0031_api_keys_role.sql`).
- **Rollback:** Postgres enum values are not removable, but RLS and `is_operator_of()` can be reverted. Rollback procedure: `update tenant_members set role = 'member' where role = 'operator'`; drop the new policies and re-create the old `memory_files_member_*` policies; drop `is_operator_of()`. The enum value sits unused.

## Migration plan

Tracked in detail in `docs/plans/2026-05-13-v1.5-launch-polish.md` Task 0a Steps 2–8. Summary:

- `0037_rbac_operator_role.sql` (or split into `0037a` + `0037b` if the runner rejects `ALTER TYPE ... ADD VALUE` followed by DML in one transaction):
  - `alter type public.tenant_role add value if not exists 'operator'`
  - `update tenant_members set role = 'operator' where role = 'member'`
  - Replace `memory_files_member_{insert,update,delete}` with `memory_files_operator_{insert,update,delete}` using `is_operator_of()`. Member SELECT policy unchanged.
- `0037c_rbac_rpc_gates.sql`: `accept_proposal()` and `reject_proposal()` re-issued with `is_operator_of()` check.
- Loop 3 / inbox migrations (Task 0g / 0g-step-1, Task 30) reference `is_operator_of()` directly.
- Application layer: `Role` type extended to `"admin" | "operator" | "member" | "viewer"` with explicit rank; `requireRole()` callsite audit; page-level GET guards on the routes listed above.
- Test coverage: `apps/dashboard/src/lib/auth/rbac.test.ts` (unit) + `apps/dashboard/test/page-guards.test.tsx` (DOM redirect — depends on Task 0c vitest config).

## Operator cascade

Audit these specific sites for the role split when implementing Task 0a (not exhaustive, but the high-risk surface codex flagged):

- `apps/dashboard/src/app/settings/keys/actions.ts` — provider key writes → `requireRole(..., "operator")`.
- `apps/dashboard/src/app/settings/team/actions.ts` — invitations, role-change UI; verify it stays at `admin`. New invitations default to `member`.
- `resolve_invitation_token` (DB function) — if it sets the new tenant_members row's role, default to `member` for invitees.
- `apps/dashboard/src/lib/loop3/actions.ts` — dismiss/snooze/installed actions require operator.
- Memory mutating server actions — operator (defense in depth on top of RLS).
- Email / invitation copy — replace any user-facing "member" wording with "teammate" where it would now be ambiguous.

## Open questions for Main

- **Should `viewer` map to the new `member` (read-only-plus-propose) or stay strictly read-only with no propose path?** Plan assumes viewer ≡ new member for v1.5; flag if Main wants stricter viewer semantics.
- **Where in the team-management UI does the role picker land?** Out of scope for this ADR — design follows in the v1.5 plan's team-settings task.

## References

- `apps/dashboard/supabase/migrations/0003_tenant_model.sql` — original `tenant_role` enum.
- `apps/dashboard/supabase/migrations/0026_memory_files_write_policies.sql` — current member write policies (replaced).
- `apps/dashboard/supabase/migrations/0008_write_path_functions.sql` — `accept_proposal()` / `reject_proposal()` (re-gated).
- [ADR-0004](0004-two-deployment-modes.md) — file-mode vs DB-mode write paths; both bind to the same RBAC rules.
- [ADR-0009](0009-loop-3-scope.md) — Loop 3 per-member scope, deferred to Phase N; v1.5 uses tenant-wide visibility flag.
- `CLAUDE.md` lock matrix — names `memory/decisions/**` as `owning_layer: main`, requiring this proposal path.
