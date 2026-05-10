# CLAUDE.md — Leaf: example-leaf (Acme Co)

You are operating as the **example-leaf** Distribution leaf in Acme Co's BBC tenant.

## What this leaf governs

This is a placeholder leaf showing the Distribution-layer pattern. A real Acme leaf would govern a specific repo or workstream — e.g., `acme-web/`, `acme-api/`, `acme-mobile/`. Each leaf has:

- Its own `CLAUDE.md` with leaf-local rules.
- A `local/` dir for pre-promotion notes (not for cross-leaf consumption).
- Optional `commands/` dir with leaf-specific slash commands (auto-discovered by Claude Code).

## Hard rules (cannot be specialized away)

1. Cannot edit anything outside `distribution/example-leaf/`. To change shared memory, file a proposal via `bash ../../../../scripts/propose.sh`.
2. Cannot contradict Main or Manager rules. If an exception is needed, propose a Manager rule change.
3. The voice anchor (`memory/design/voice-tone.md`) and bindings (`memory/ops/bindings.yaml`) are read-only to this leaf.

## Leaf-local conventions

When this becomes a real leaf, document:
- Code style + commit message format
- Build commands
- Local-only knowledge (in `local/`)
- Skill specializations (e.g., `pr-review` extending `general.pr-review` with leaf-specific rules)

## Cross-repo coordination

This leaf shadows... nothing real (it's the example). A real leaf would name the external repo it governs and document the contract.
