# F4-build-1 — Data Model Population (SUMMARY)

## Status

**Complete (2026-05-08).** Mechanical population per F4 design. All three YAML layers in place; Manager rule on vendor names authored; legacy `vendors.md` superseded; `tech/stack.md` rewritten in role terms; vendor-name audit across BBC clean.

## What was created

**11 role contracts** in `memory/ops/provider-roles/`:

| Role | Status |
|---|---|
| `llm-provider` | active binding |
| `db-provider` | active binding |
| `web-host` | active binding |
| `api-host` | active binding |
| `email-delivery` | active binding |
| `subscription-receipt` | active binding |
| `analytics` | candidate binding (provisional) |
| `design-source` | active binding |
| `pattern-reference` | active binding |
| `image-edit-provider` | UNBOUND (no candidate adapter yet) |
| `video-gen-provider` | UNBOUND (no candidate adapter yet) |

**9 adapter declarations** in `memory/ops/providers/`:

`anthropic-claude-sonnet`, `supabase`, `cloudflare-workers`, `railway`, `resend`, `revenuecat`, `posthog` (status: candidate), `figma`, `mobbin`.

**Bindings table** at `memory/ops/bindings.yaml` — single mapping per role, with `bound_at` dates and notes for provisional/unbound rows.

**Manager rule** at `manager/rules/no-vendor-names-in-prose.md` — defines allowed locations, forbidden locations, detection procedure, exception path, and links to F4 design.

## What was changed

- `memory/ops/vendors.md` rewritten as a transitional human-readable view that points at `bindings.yaml` + adapter YAMLs. Will be archived after F4-build-2.
- `memory/tech/stack.md` rewritten in role terms; vendor names removed.
- `manager/rules/promotion-criteria.md` example updated ("Resend free tier" → "the email-delivery provider's free tier").
- Final repo-wide audit: zero vendor-name occurrences outside the F4 allowlist (excluding `.planning/**` which is allowed for design rationale).

## Schema gaps surfaced (real findings from doing the work)

These are documented here because they're the whole reason F4-build-1 was framed as "mechanical, low-risk, exposes schema gaps."

1. **`scripts/index-memory.sh` only indexes `*.md`** — the new `provider-roles/*.yaml` and `providers/*.yaml` files are invisible to `_index.md`. Either expand the indexer to handle YAML, or formally declare ops-registry files out of scope for the memory index. Recommendation: declare them out of scope; they have their own canonical entry point (`bindings.yaml`).

2. **F4 design uses `.yaml`; existing memory uses `.md` with frontmatter.** This is a deliberate split (data vs prose) but it's not formally documented anywhere. Add a section to `memory/_schema.md` distinguishing "memory entries" (`.md`) from "ops registry data" (`.yaml`).

3. **No machine validator for the YAMLs themselves.** A typo like `implments:` instead of `implements:` would silently produce a broken adapter. F4-build-1 doesn't ship a validator; F4-build-2 or a parallel sub-phase should add `scripts/validate-providers.sh`.

4. **Provisional bindings use parens (`(provisional: posthog)`)** in `bindings.yaml`. That's a presentation hack, not a schema. A `provisional: true` flag on the binding row would be cleaner. Defer to F1-build-1 since profile constraints will need to read this field.

5. **Many adapter metadata fields are guessed or marked `<unknown>`.** Cost numbers for the LLM adapter are explicitly ASSUMED. `last_incident_seen` is `<unknown>` for all adapters. F1's trust scoring will be misled by these placeholders. Mitigation: a "verify metadata" pass (manual or scripted) before F1-build-3 runs the ranker on real data.

6. **`Stability signals` block has no refresh mechanism.** Status pages exist; nobody pulls from them. Need a future cron-style script (or a Manager weekly task) that updates `last_incident_seen`. Out of scope for F4-build-1.

7. **`no-vendor-names-in-prose.md` has no automated linter.** V1 is manual review. The rule even names the future script (`scripts/lint-no-vendor-names.sh`). Without it, vendor names will leak back in over time. Should be authored before F2-build-* (which will add many more memory files).

8. **No `_archived/` precedent yet.** `memory/ops/providers/_archived/` was created but is empty. The first decommission (F4-build-3) will exercise it; if any structural issues come up, will be caught then.

9. **Cross-repo coordination unverified.** The new YAMLs reference paths in `8azi-web/` and `8azi-api/` (e.g., `8azi-api/app/shared/llm/`). Those paths exist now but are not linked from any test. M1 (migrate 8azi-web as a leaf) will need to enforce this linkage; today it's prose-level documentation only.

10. **The `bbc-provider:<provider-id>` tag is documented per-adapter but not yet used in any consumer-repo code.** F4-build-2 is the phase that retroactively tags existing code. Until then, decommission would have to grep for vendor display names ("Higgsfield", "Anthropic"), which is what F4 was designed to avoid. F4-build-2 is the highest-priority follow-up.

## Files touched

- `memory/ops/provider-roles/{llm,db,web-host,api-host,email-delivery,subscription-receipt,analytics,design-source,pattern-reference,image-edit,video-gen}-provider.yaml` (11 new)
- `memory/ops/providers/{anthropic-claude-sonnet,supabase,cloudflare-workers,railway,resend,revenuecat,posthog,figma,mobbin}.yaml` (9 new)
- `memory/ops/providers/_archived/` (new empty dir)
- `memory/ops/bindings.yaml` (new)
- `manager/rules/no-vendor-names-in-prose.md` (new)
- `memory/ops/vendors.md` (rewritten — transitional)
- `memory/tech/stack.md` (rewritten — role-based)
- `manager/rules/promotion-criteria.md` (example fix)

## Next phase

**F4-build-2: consumer-code tagging.** Each leaf adds `bbc-provider:<provider-id>` tags to its existing vendor-specific code. Without it, decommissioning still requires hand-grep for display names — which is exactly the thing F4 was designed to obviate. Highest priority among F4 follow-ups.
