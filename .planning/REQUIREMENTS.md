# REQUIREMENTS — BBC V1

## Functional

1. **Three-layer hierarchy.** Main, Manager, Distribution each have a `CLAUDE.md`. An agent opened in any layer can resolve its layer by directory and bootstrap.
2. **Memory store.** All knowledge lives under `memory/` as Markdown + YAML frontmatter. Frontmatter schema is canonical (see `memory/_schema.md`).
3. **Proposal queue.** Distribution and Manager cannot directly mutate higher-layer memory. They write a queue file. Acceptance applies the diff and archives the proposal.
4. **Layer ownership.** Every memory file declares `owning_layer`. Direct writes are restricted to that layer's session.
5. **Bootstrap mechanic.** A new leaf is created by `scripts/bootstrap-leaf.sh <name>`, which scaffolds the directory and produces a leaf `CLAUDE.md` with Main+Manager headers prepended.
6. **Audit trail.** All accepted and rejected proposals stay in `queue/_accepted/` and `queue/_rejected/` indefinitely.

## Non-functional

- **No toolchain in V1.** Bash + Markdown only. Anything that requires installing a runtime is out of scope.
- **Idempotent scripts.** Re-running `bootstrap-leaf.sh` or `index-memory.sh` produces the same output as the first run.
- **Obsidian-compatible.** Frontmatter, `[[wikilinks]]`, and `tags:` work if the user opens `memory/` as an Obsidian vault. No vault-only syntax (e.g., Dataview queries) in V1.
- **Deterministic indexing.** `_index.md` regeneration with no memory changes produces a byte-identical file.

## Acceptance for V1 done

The 5-step end-to-end verification in `.planning/phases/06-verification/PLAN.md` passes without manual fixup, in clean Claude sessions.
