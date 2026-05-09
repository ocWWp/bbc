# F4 — Provider Interface (DESIGN)

## Context

`memory/ops/vendors.md` already lists role-to-vendor bindings (Anthropic for `llm-provider`, Supabase for `db-provider`, Higgsfield TBD for `image-edit-provider`, etc.). It works as a single read-only table but doesn't enforce any of the downstream guarantees BBC needs:

1. **Vendor-agnostic agent instructions.** Today, leaf and Manager rules can mention "Higgsfield" by name. When Higgsfield gets dethroned, every mention rots. Roles fix this — agents reference `image-edit-provider`, never the vendor name.
2. **Contracts.** A vendor either satisfies the role's required operations or doesn't. Without a written contract, "can we swap to Runway?" is an opinion; with one, it's a checklist.
3. **Auditable swaps.** Vendor changes today would be a free-form edit to `vendors.md`. We need the same queue-driven, reviewed, provenance-stamped flow as any other rule change — *especially* for swaps that touch shared cross-repo state.
4. **Clean removal.** When a vendor is dropped, its references should leave the codebase deliberately, not by `grep`-and-pray. The user's earlier spec calls this **Announce → Quarantine → Purge**.

This phase defines the **data model, lifecycle, and decommissioning protocol**. It does NOT implement runtime adapters, ranker logic (that's F1), or any code in consumer repos.

---

## 1. Three-layer data model

### Layer A — Role contract

A *role* is the abstract interface ("what an `image-edit-provider` must do"). One file per role, lives in `memory/ops/provider-roles/<role-id>.yaml`. Owning layer: `main` (changing a role is a principle-level decision; ADR required).

```yaml
# memory/ops/provider-roles/image-edit-provider.yaml
---
id: role_image-edit-provider
role_id: image-edit-provider
type: provider-role
scope: org
layer: main
owning_layer: main
created: 2026-05-08T00:00:00Z
updated: 2026-05-08T00:00:00Z
contract_version: 1
status: accepted
---

# Role: image-edit-provider

## Purpose
Edits an existing image given a prompt. Synchronous request/response. Used by
marketing-copy generation, social-post visuals, illustration polish.

## Required operations
- name: edit
  inputs:
    image: { type: binary, formats: [jpg, png, webp] }
    prompt: { type: string, max_length: 2000 }
    style: { type: string, optional: true }
  outputs:
    edited_image: { type: binary, formats: [jpg, png, webp] }
    metadata: { type: object, fields: [prompt_revision, content_warnings] }
  constraints:
    max_input_resolution: "4096x4096"
    min_output_resolution: "1024x1024"
    max_latency_p95_ms: 30000

## Required metadata (every adapter must declare)
- cost_per_call_usd
- latency_p95_ms
- rate_limit_per_minute
- content_filter_policy_url

## Hard rules (ranker cannot override)
- content_filter_policy_url MUST be HTTPS and publicly accessible.
- max_input_resolution MUST be at least 1024x1024.

## Versioning
contract_version increments when required operations or hard rules change.
Adapters declare which contract_version they satisfy. Mismatches block selection.
```

### Layer B — Adapter declaration

An *adapter* is a concrete vendor + version + integration that satisfies one or more role contracts. One file per adapter, lives in `memory/ops/providers/<provider-id>.yaml`. Owning layer: `main` (changing what's bound to a role is org-wide).

```yaml
# memory/ops/providers/higgsfield-v2.yaml
---
id: provider_higgsfield-v2
provider_id: higgsfield-v2
type: provider-adapter
implements: [image-edit-provider]
contract_version: 1
status: candidate          # candidate | active | deprecated | archived
scope: org
layer: main
owning_layer: main
created: 2026-05-08T00:00:00Z
updated: 2026-05-08T00:00:00Z
---

# Adapter: higgsfield-v2

## Metadata (verified)
- cost_per_call_usd: 0.02
- latency_p95_ms: 8000
- rate_limit_per_minute: 60
- content_filter_policy_url: https://higgsfield.com/policies/content
- last_verified: 2026-05-08
- verified_by: human:zeth

## Runtime
- endpoint: https://api.higgsfield.com/v2/edit
- auth: bearer-token (env: HIGGSFIELD_API_KEY)
- consumer-side SDK: 8azi-web/lib/providers/higgsfield.ts (NOT in BBC)

## bbc-provider-tag
Use this exact string in code comments / config to mark vendor-specific
artifacts in consumer repos: `bbc-provider:higgsfield-v2`. Quarantine and
purge phases grep for this tag to find what needs replacing.

## Notes
First adopted 2026-04-15. Marketing flow only. Not yet wired into web/api.
```

**Status lifecycle:**
- `candidate` — known about, not bound to any role.
- `active` — currently bound (referenced from `bindings.yaml`).
- `deprecated` — sunset announced; still bound; replacement in flight.
- `archived` — not bound to any role; kept for historical audit.

### Layer C — Bindings

`memory/ops/bindings.yaml` is the runtime mapping. ONE binding per role at any moment (V1 simplification — multi-binding A/B testing is future F1 work). Owning layer: `main`.

```yaml
# memory/ops/bindings.yaml
---
id: bindings_2026-05-08
type: provider-bindings
scope: org
layer: main
owning_layer: main
created: 2026-05-08T00:00:00Z
updated: 2026-05-08T00:00:00Z
status: accepted
---

# Active bindings

| role | provider | bound_at |
|---|---|---|
| llm-provider | anthropic-claude-sonnet | 2026-03-01 |
| db-provider | supabase | 2026-03-01 |
| web-host | cloudflare-workers | 2026-03-01 |
| api-host | railway | 2026-03-01 |
| email-delivery | resend | 2026-03-01 |
| subscription-receipt | revenuecat | 2026-03-01 |
| analytics | posthog | 2026-04-12   (provisional)|
| design-source | figma | 2026-03-01 |
| pattern-reference | mobbin | 2026-03-01 |
| image-edit-provider | (unbound) | — |
| video-gen-provider | (unbound) | — |
```

The binding date lets you correlate "this code path uses `image-edit-provider`" → "as of `bound_at`, that meant `higgsfield-v2`". Useful for archaeological diffs after a swap.

---

## 2. How agent instructions reference providers

**Today (forbidden after F4):**
> "Use Higgsfield to edit the image and return it to the dashboard."

**After F4:**
> "Use the bound `image-edit-provider` to edit the image and return it to the dashboard. The current binding is recorded in `memory/ops/bindings.yaml`."

Concretely:
- Leaf and Manager Claude.md files must NEVER hardcode vendor names. Mentions must use `<role-id>`.
- The only files allowed to name vendors are `memory/ops/providers/<provider>.yaml` (adapter declarations) and `memory/ops/bindings.yaml` (the binding table itself).
- A new Manager rule (`manager/rules/no-vendor-names-in-prose.md`) makes this enforceable at review time. New proposals that mention a vendor outside the allowed files get `changes_requested` automatically.

`memory/ops/vendors.md` (current state) becomes a thin transitional doc: it cites `bindings.yaml` and links to each adapter file. Eventually superseded by `bindings.yaml` directly; for V1 of F4 it stays as the human-readable view.

---

## 3. Decommissioning workflow — Announce → Quarantine → Purge

Three queue-driven state transitions on the adapter's YAML, each gated by Manager review and Main accept. The transitions also fan out to the leaves that depend on the provider.

### Phase 1: Announce (T = 0)

**Trigger:** human or Manager decides a provider must be replaced (cost, quality, policy, vendor death).

**Action:**
1. Manager files a `change_kind: edit` proposal against the adapter YAML:
   - `status: active` → `status: deprecated`
   - Adds `sunset_date: <ISO date, T + 30 days default>`
   - Adds `replacement_provider_id: <other-provider-id>` (or `tbd`)
   - Adds `decommission_reason: "<short>"`
2. Manager review attaches `cross_leaf_impact:` with affected leaves listed (any leaf whose code mentions the `bbc-provider-tag`).
3. Main accepts. Adapter is now deprecated but still bound.
4. **Side-effect:** Manager files follow-up `change_kind: add` proposals for each affected leaf, adding a leaf-local note in `distribution/<leaf>/local/decommission-<provider>.md` saying:
   > Provider `<id>` is deprecated as of `<announce_date>`. Sunset `<sunset_date>`. Audit your code for `bbc-provider:<id>` tags and replace before sunset.

### Phase 2: Quarantine (T to sunset_date)

**Action:**
1. Adapter YAML's `status: deprecated` is the canonical signal. New code MUST NOT use this provider.
2. Each affected leaf is responsible for replacing its tagged usages. Replacement code uses the new provider's adapter (or, if still TBD, marks the call site `bbc-provider:tbd-image-edit-provider` until binding is updated).
3. Manager runs a weekly sweep:
   ```bash
   bash scripts/decommission-status.sh <provider-id>
   ```
   (Future script — designed but not implemented in F4.) Outputs per-leaf grep counts of remaining `bbc-provider:<id>` tags.
4. The binding in `memory/ops/bindings.yaml` flips to the replacement provider AS SOON AS the replacement is wired in any leaf, even if other leaves are still on the deprecated one. Tagged code in the un-migrated leaves is the audit signal.

### Phase 3: Purge (T = sunset_date)

**Pre-conditions checked by Manager:**
- All leaves report zero `bbc-provider:<deprecated-id>` tags.
- Replacement provider is `active` and bound.

**Action:**
1. Manager files a `change_kind: supersede` proposal against the adapter YAML:
   - `status: deprecated` → `status: archived`
   - File MOVES from `memory/ops/providers/<id>.yaml` to `memory/ops/providers/_archived/<id>.yaml`
2. Manager files a `change_kind: add` proposal authoring an ADR:
   `memory/decisions/<NNNN>-decommission-<provider>.md` summarizing reason, dates, replacement.
3. Main accepts both. Provider is gone from active use; history preserved.

**Failure mode:** if a leaf is found post-sunset to still tag this provider, the purge proposal gets `changes_requested` from Manager. Leaf must clean up first. Sunset_date can be extended via a `change_kind: edit` against the adapter YAML, but the extension is a visible audit event.

---

## 4. Files this phase WILL produce when implemented (not yet)

```
memory/ops/
├── provider-roles/
│   ├── llm-provider.yaml
│   ├── db-provider.yaml
│   ├── web-host.yaml
│   ├── api-host.yaml
│   ├── email-delivery.yaml
│   ├── subscription-receipt.yaml
│   ├── analytics.yaml
│   ├── design-source.yaml
│   ├── pattern-reference.yaml
│   ├── image-edit-provider.yaml      # currently unbound
│   └── video-gen-provider.yaml       # currently unbound
├── providers/
│   ├── anthropic-claude-sonnet.yaml
│   ├── supabase.yaml
│   ├── cloudflare-workers.yaml
│   ├── railway.yaml
│   ├── resend.yaml
│   ├── revenuecat.yaml
│   ├── posthog.yaml
│   ├── figma.yaml
│   ├── mobbin.yaml
│   └── _archived/                   # decommissioned adapters land here
└── bindings.yaml

manager/rules/
└── no-vendor-names-in-prose.md       # new Manager rule (cited by review)

scripts/
├── decommission-provider.sh          # orchestrates Announce→Quarantine→Purge
├── decommission-status.sh            # weekly sweep of bbc-provider tags
└── (extensions to existing scripts as needed)

.claude/commands/bbc/
├── bind-provider.md                  # /bbc:bind <role> <provider> (V1.1)
└── decommission.md                   # /bbc:decommission <provider> (V1.1)
```

`memory/ops/vendors.md` is updated to cite `bindings.yaml` and individual adapter files; eventually superseded.

---

## 5. What F4 explicitly does NOT solve (honest scope)

These are out — they belong to F1, F2, or never:

- **Tool credibility / ranker.** Choosing *which* provider to bind when multiple satisfy a role is F1's job. F4 only enforces "one provider per role at a time" and lets you swap cleanly.
- **Cold start.** When a brand-new role appears (e.g., a new `voice-clone-provider`) with zero candidate adapters, F4 doesn't help you discover one. F1 + human curation does.
- **Outcome attribution.** "Did the swap improve marketing engagement?" is downstream measurement (PostHog, future analytics phase). F4 just records the swap event in `bindings.yaml` and ADRs so attribution is even possible.
- **Gamed trust signals.** A vendor inflating its own metadata is a separate adversarial problem.
- **Runtime / SDK code.** F4 stays in `memory/`. The actual TypeScript / Python adapters live in consumer repos (`8azi-web/lib/providers/`, etc.) and are governed by leaf-level rules.
- **Multi-region failover.** When `anthropic-claude-sonnet` is bound but the API is degraded, F4 doesn't auto-fallback to `anthropic-claude-haiku`. That's runtime; that's the consumer repo's concern.
- **Dynamic A/B testing of providers.** Two adapters bound simultaneously to the same role is a future F1+F4 extension.

---

## 6. Migration when F4 is implemented

Sequenced as its own future build phases (NOT part of this design doc):

1. **F4-build-1 (data model):** Author all role + adapter + bindings YAMLs from current `memory/ops/vendors.md`. Add Manager rule on vendor names in prose. No leaf changes.
2. **F4-build-2 (consumer audit):** Each leaf adds `bbc-provider:<id>` tags to its existing vendor-specific code. Leaves that don't comply get a Manager-filed `cross_leaf_impact:` follow-up.
3. **F4-build-3 (first decommission rehearsal):** Pick one low-stakes provider (e.g., a candidate `image-edit-provider` that was never wired) and walk it through Announce → Quarantine (effectively no-op since unwired) → Purge. Validates the workflow end-to-end without risking real traffic.
4. **F4-build-4 (decommission script + slash command):** Implement `scripts/decommission-provider.sh` and the `/bbc:decommission` command (and likely `/bbc:bind`). Gated behind manual confirmation in V1.1.

Each F4-build-* is its own phase plan, written when starting.

---

## 7. Open questions to resolve at F4-build-1 start

1. **Single vs. multi-binding per role.** Design above is single-binding for V1 simplicity. Multi-binding (A/B, regional, percentage rollout) needs a `bindings.yaml` schema with weights. Defer.
2. **Where does `bbc-provider-tag` live in consumer code?** Comment convention vs. config vs. metadata file? V1 default: a code comment near every call site (`// bbc-provider:higgsfield-v2`), grep-able. M1+ may add typed config.
3. **Manager rule enforcement of "no vendor names in prose"** — at V1 it's manual review. CI hook in a much later phase.
4. **Sunset extension policy.** Default 30 days; how many extensions are allowed before a hard stop? Future Manager rule.
5. **Cross-org sharing of provider declarations.** Could multiple BBC instances (different orgs) share an upstream registry of role/adapter contracts? Out of scope for V1; flag for ecosystem thinking.

---

## 8. Acceptance signal for this DESIGN phase

This phase is "complete" when:

- This PLAN.md exists and a human has read it.
- The roadmap reflects F4 as designed (not implemented).
- A future build phase can start with `/gsd:plan-phase F4-build-1` referencing this doc.

No code, no YAMLs, no scripts produced in this phase. F4 is now a known, structured shape — not a hand-waved "BBC abstracts vendors somehow."
