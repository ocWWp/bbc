# F4-build-2 — Consumer-code Tagging + Validator (SUMMARY)

## Status

**Complete (2026-05-08).** Two deliverables shipped:

1. **`scripts/validate-providers.sh`** — schema + cross-reference validator for the F4 YAMLs (closes F4-build-1 SUMMARY gap #2).
2. **`bbc-provider:<id>` tags** added to 10 vendor-callsite files across `8azi-api/` and `8azi-web/` (closes F4-build-1 SUMMARY gap #7).

## Validator

`scripts/validate-providers.sh` checks:

- Every role YAML has required frontmatter and valid status.
- Every adapter YAML has required frontmatter and valid status (`candidate` / `active` / `deprecated` / `archived`).
- Every adapter's `implements: [<role-id>]` list references a role that exists.
- Every adapter's `contract_version` matches the role it implements.
- `bindings.yaml` references roles and adapters that exist.
- An adapter cannot be bound while `archived`. Bindings to `candidate` adapters get a warning.
- `--strict` mode promotes warnings to errors (non-zero exit).

Run on the current repo state:

```
validate-providers: 11 roles, 9 adapters, 0 archived

2 warning(s):
  WARN: bindings.yaml: 'analytics' has provisional binding to 'posthog' (use a 'provisional: true' field once schema supports it)
  WARN: bindings.yaml: role 'analytics' bound to candidate adapter 'posthog'

clean ✓
```

The two warnings are exactly the gaps documented in F4-build-1's SUMMARY (provisional binding + candidate adapter). Validator detects them programmatically; nothing new to fix here.

## Consumer-code tags applied

10 files modified — all comment-only, no logic changes:

| Repo | File | Tag |
|---|---|---|
| 8azi-api | `app/services/ai.py` | `# bbc-provider:anthropic-claude-sonnet` |
| 8azi-api | `app/routers/party.py` | `# bbc-provider:anthropic-claude-sonnet` |
| 8azi-api | `app/services/supabase.py` | `# bbc-provider:supabase` |
| 8azi-api | `app/services/email.py` | `# bbc-provider:resend` |
| 8azi-web | `src/shared/lib/supabase/service.ts` | `// bbc-provider:supabase` |
| 8azi-web | `src/shared/lib/supabase/server.ts` | `// bbc-provider:supabase` |
| 8azi-web | `src/shared/lib/supabase/browser.ts` | `// bbc-provider:supabase` |
| 8azi-web | `src/app/auth/confirm/page.tsx` | `// bbc-provider:supabase` |
| 8azi-web | `wrangler.toml` | `# bbc-provider:cloudflare-workers` |
| 8azi-web | `open-next.config.ts` | `// bbc-provider:cloudflare-workers` |

Tag placement convention: a single comment line directly above the vendor SDK import or canonical config block. The tag is grep-able from any directory:

```bash
grep -rn "bbc-provider:supabase" /path/to/repos
# → 5 matches (1 in 8azi-api, 4 in 8azi-web)
```

## What this closes

- **Decommissioning grep is now deterministic.** Before this phase, "where do we use Supabase?" was a `grep -i supabase` across two repos that returned 30+ matches mixing config, comments, imports, and string literals. After: 5 surgical hits, each at a vendor SDK boundary.
- **F4-build-3 (decommission rehearsal) is now executable.** The Quarantine phase (per F4 design §3) defines its sweep using these tags; without them, F4-build-3 would have to invent vendor display-name patterns.
- **Schema typos in YAMLs are now machine-detected.** A future edit that misspells `implements:` as `implments:` would fail validation, not silently produce a broken adapter.

## What's NOT commited

The 10 file edits sit as uncommitted modifications in `8azi-api/` and `8azi-web/` working trees. Per BBC convention, the user reviews + commits in their own time:

```bash
cd 8azi-api && git diff
cd 8azi-web && git diff
```

If unhappy with placement, `git checkout -- <file>` reverts cleanly (each edit is a single comment line).

## Files (BBC-side) created

- `scripts/validate-providers.sh` (executable; runs in `--strict` mode too)
- `.planning/phases/F4-build-2-consumer-tagging/SUMMARY.md` (this file)

## Schema gaps still open (carried forward)

From F4-build-1's list of 10, this phase closed #2 (no validator) and #7 (no consumer tags). Still open:

1. `index-memory.sh` doesn't see YAML files. (Decision deferred: declare ops-registry as out-of-scope for `_index.md`.)
3. F4 uses `.yaml`; rest of memory uses `.md` with frontmatter. Needs formal documentation in `_schema.md`.
4. Provisional bindings hack (`(provisional: posthog)`) — bindings.yaml schema upgrade.
5. ASSUMED metadata (especially LLM costs) needs verification pass before F1.
6. Stability signals have no refresh mechanism.
7. `lint-no-vendor-names.sh` — automate the Manager rule. Mentioned in `manager/rules/no-vendor-names-in-prose.md` itself.
8. No `_archived/` precedent yet (will be exercised by F4-build-3).
9. Cross-repo path references in adapter YAMLs are prose-level only.

## Next phase

**F4-build-3: decommission rehearsal.** Pick a low-stakes provider (e.g., MOBBIN since it's reference-only with no production code path) and walk it through the full Announce → Quarantine → Purge cycle. Validates the workflow end-to-end against real (now-tagged) consumer code. Will surface the schema gap re: `_archived/` directory ergonomics.
