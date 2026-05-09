# Rule: No vendor names in prose

Manager rejects any proposal whose body or target file mentions a vendor name in prose, EXCEPT where the F4 architecture explicitly allows it.

## Why

F4's premise: agent instructions, leaf rules, and shared memory should reference **roles** (e.g., `llm-provider`, `image-edit-provider`), never **vendors** (e.g., "Anthropic", "Higgsfield"). When a vendor changes, role-based prose stays correct; vendor-based prose rots.

## Allowed locations for vendor names

A proposal may name a vendor only in these files:

| Path | Why |
|---|---|
| `memory/ops/providers/<provider>.yaml` | Adapter declarations are vendor-specific by definition. |
| `memory/ops/bindings.yaml` | Maps role → vendor; vendor names are the right-hand side of the mapping. |
| `memory/decisions/*.md` (ADRs) | Historical decisions that named a vendor at the time should preserve that history. |
| `manager/rules/external-signal-sources.md` (future, F1) | External signals are vendor-specific by nature. |
| `memory/ops/vendors.md` | Transitional human-readable view; cites the YAML files. Will be superseded. |
| `.planning/**/*.md` | Planning docs and phase summaries may mention vendors when discussing the rationale. |

## Forbidden locations

Any other file. In particular:

- `bbc/CLAUDE.md`, `manager/CLAUDE.md`, any `distribution/<leaf>/CLAUDE.md`
- `manager/rules/**` (this file, `proposal-review.md`, `cross-leaf-sync.md`, etc., other than the explicit allow above)
- `memory/product/`, `memory/design/`, `memory/glossary/`, `memory/people/`, `memory/tech/` (use roles, not vendors)
- `memory/ops/provider-roles/**` (role contracts MUST be vendor-neutral)
- `bbc/.claude/commands/**`
- All leaf code, configs, and rules — instead use the `bbc-provider:<provider-id>` tag in code comments at the call site.

## Detection

V1: manual review by Manager during queue triage. The reviewer reads the proposal body and target file diff; flags any vendor-name occurrence outside allowed locations as `changes_requested`.

V1.x (future): a `scripts/lint-no-vendor-names.sh` that greps the BBC tree for known vendor names and reports occurrences outside the allowlist. Vendor-name list comes from `memory/ops/providers/*.yaml` (each adapter declares itself).

## Procedure when violation found

Verdict: `changes_requested`. Notes should:
1. Identify the offending vendor name and location.
2. Suggest the role-based replacement (look up which role this vendor implements).
3. Reference this rule and the F4 design (`.planning/phases/F4-provider-interface/PLAN.md` §2).

## Exception path

If a proposer believes a specific case requires naming a vendor outside the allowlist, the proposer must:

1. File a separate `change_kind: edit` proposal against THIS rule (`manager/rules/no-vendor-names-in-prose.md`) adding the new allowed location with rationale.
2. Get it approved before — or alongside — the original proposal.

This is intentional friction: cross-the-line cases should be visible.
