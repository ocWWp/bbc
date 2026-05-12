# Phase L1 — Role-Tool-Bundle binding layer

**Status:** Foundation shipped (read path); integration pending.
**Belongs to:** Loop 2 (per ADR-0008). The infrastructure every future role agent depends on.
**Predecessor:** Phase J (Marketing Studio) shipped a hardcoded Anthropic call; this phase makes that call resolve through the binding layer.
**Successor:** Phase L+ (second role agent, e.g. eng-default) — cheap once L1 is real.

## Why this exists

Without this layer, BBC ships **one** role agent (Marketing Studio) instead of **a pattern** for role agents. Every future agent (founder, eng, design) would re-hardcode its tool choices, defeating the central promise: "agents come pre-equipped with the best tools for their role."

The role-tool-bundle layer reads three already-existing schemas — `memory/ops/providers/*.yaml`, `memory/ops/profiles/*.yaml`, `memory/ops/bindings.yaml` — and exposes a typed resolver: *given a role and (optionally) a task class, which provider adapter should this agent use?*

## What ships in L1 (this sub-phase)

| File | What | Status |
|---|---|---|
| `packages/store/src/interfaces.ts` | `Tool` type + `ToolsStore` interface | ✅ shipped |
| `packages/store/src/local/tools.ts` | `LocalToolsStore` — file-mode reads | ✅ shipped |
| `packages/store/src/supabase/tools.ts` | `SupabaseToolsStore` — DB-mode stub (returns empty) | ✅ shipped |
| `apps/dashboard/src/lib/read-tools.ts` | Thin shim mirroring `read-bindings.ts` | ✅ shipped |
| Smoke verification | Run `list / resolveRole / candidatesFor` against real `memory/ops/`, confirm 8 providers and 4 role resolutions | ✅ verified |

### Public API surface

```ts
import type { Tool } from "@bbc/store";
import { resolveRoleTool, listTools, candidateToolsFor } from "@/lib/read-tools";

const llm = await resolveRoleTool("llm-provider");
// → Tool { provider_id: "anthropic-claude-sonnet", implements: ["llm-provider"], status: "active", metadata: {...} }

const imageGen = await resolveRoleTool("image-edit-provider");
// → null   (unbound — caller falls back to its own default or surfaces "not configured")

const cands = await candidateToolsFor("llm-provider");
// → Tool[]  (every adapter declaring `implements: [llm-provider]` and `status != archived`)
```

## What is NOT in L1

Deliberately deferred to keep this commit-shippable on its own:

- **Marketing Studio integration** — Studio still calls `getAnthropicClient()` directly. Wiring `resolveRoleTool("llm-provider")` into Studio is **L1.1**. Risk: PR #1's smoke test relies on Studio's existing behavior.
- **DB-mode population** — `SupabaseToolsStore` is a stub returning empty. The `provider_adapters` and `tenant_bindings` tables don't exist yet. That migration + the typed reader is **L1.2**.
- **Profile-aware ranking** — `marketing-default.yaml` declares `task_classes: [image-edit, video-gen, social-publish, copy-generate]` and an empty `preferred_providers: []`. The resolver currently returns the bound provider regardless of profile; profile-aware filtering is **L1.3**.
- **Per-tenant override path** — file-mode is single-tenant so bindings.yaml IS the override. DB-mode needs per-tenant overrides via a propose-change flow; that's **L1.2** alongside the SQL migration.

## Acceptance criteria (for L1, achieved)

1. ✅ Type-check clean across `@bbc/store` + `@bbc/dashboard`.
2. ✅ `LocalToolsStore.list()` returns ≥ 8 active providers from `memory/ops/providers/*.yaml`.
3. ✅ `LocalToolsStore.resolveRole(r)` matches `bindings.yaml` for every active role.
4. ✅ Unbound roles (e.g. `image-edit-provider`) return null without errors.
5. ✅ No new runtime deps added; matches the codebase pattern (regex-parsed YAML, no `js-yaml`).
6. ✅ No mutations to Marketing Studio behavior.

## L1.1 — Marketing Studio integration (next sub-phase)

Smallest meaningful integration that proves the resolver:

1. In `apps/dashboard/src/app/studio/marketing/actions.ts`, before each Anthropic call, resolve the LLM provider:
   ```ts
   const llm = await resolveRoleTool("llm-provider");
   const modelId = llm?.metadata.model_id ?? "claude-sonnet-4-6";  // fallback
   ```
2. Use `modelId` instead of the hardcoded `RUN_MODEL` constant.
3. Smoke: change the binding from `anthropic-claude-sonnet` to a non-existent provider in a local copy → Studio falls back to the default and logs a warning. Restore the binding.
4. If green, **no API surface change** for end users; this is invisible plumbing.

After L1.1, swapping LLM providers becomes a single-line bindings.yaml edit.

## L1.2 — DB-mode (further out)

Two SQL tables:

- `provider_adapters` — global catalog (synced from `memory/ops/providers/*.yaml` via a one-shot migration).
- `tenant_bindings` — per-tenant role→provider override, RLS-gated like every other tenant table.

`SupabaseToolsStore` reads from those. Tenant overrides via `propose_change()` SQL function (existing infra from ADR-0004).

## L1.3 — Profile-aware ranking (further out)

When more than one provider declares `implements: [role]` (e.g. once we add a second image-edit candidate), the resolver picks by the active profile's `preferred_providers` order. Currently overkill — every role has exactly one binding.

## Open questions

| Q | Default answer | Revisit when |
|---|---|---|
| Profile parsing — do we parse `applies_to.task_classes` now? | Not in L1; the resolver is role-keyed, not task-class-keyed. | Adding a second image-edit candidate. |
| Cost-cap enforcement in resolver? | No — that lives in `_org-policy.yaml` hard constraints, enforced at call-time by the role agent. | Once F1 (ranker) ships. |
| MCP server endpoints per role agent? | One server, per-role API key scopes (already in `api_key_scope` enum). | Building the second role agent. |
