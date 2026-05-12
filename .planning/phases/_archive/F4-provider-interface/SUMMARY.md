# F4 — Provider Interface (SUMMARY)

## Status

**Designed (2026-05-08).** Pure design phase. No implementation.

## What was decided

A three-layer data model lives under `memory/ops/`:

- **Role contracts** (`provider-roles/<role>.yaml`) — abstract interface every adapter must satisfy.
- **Adapter declarations** (`providers/<provider>.yaml`) — concrete vendor + version + metadata declaring which contract it satisfies.
- **Bindings** (`bindings.yaml`) — single mapping from role to active adapter at the org level.

Plus:

- An enforceable Manager rule that bans vendor names from prose (Claude.md, rules, leaf docs); only the three YAML layers above can mention them.
- A three-phase **Announce → Quarantine → Purge** decommissioning workflow expressed as queue-driven state transitions on the adapter YAML, with cross-leaf-impact propagation.
- A `bbc-provider:<id>` tag convention for consumer-repo code, grep-able for quarantine sweeps.

## What's NOT in F4

Explicitly out of scope: ranker logic (F1), cold-start discovery, outcome attribution, runtime adapter code, multi-region failover, dynamic A/B testing.

## Next phases (separate plans, not started)

- **F4-build-1:** author the role/adapter/bindings YAMLs from current `vendors.md`. Add the no-vendor-names Manager rule.
- **F4-build-2:** leaves tag their vendor-specific code with `bbc-provider:<id>`.
- **F4-build-3:** rehearse one decommission cycle on a low-stakes provider.
- **F4-build-4:** implement `scripts/decommission-provider.sh` + `/bbc:decommission` and `/bbc:bind` slash commands.

## Source

Phase 08 surfaced that `memory/ops/vendors.md` was a flat table with no contract, no swap protocol, no leaf-tag mechanism. The user's earlier spec called for "design a Provider Interface with abstract base class, YAML registry, and 3-phase Announce-Quarantine-Purge decommissioning"; this design doc realizes that.

Full design: `PLAN.md` in this directory.
