# Leaf template

This directory is **not a real leaf**. It exists as the source `bootstrap-leaf.sh` copies from when scaffolding a new Distribution leaf.

To make a real leaf:

```bash
bash bbc/scripts/bootstrap-leaf.sh my-new-leaf
```

That creates `bbc/distribution/my-new-leaf/` with this template's `CLAUDE.md`, an empty `local/`, an empty `commands/`, and a leaf README.

## What goes in a real leaf's `CLAUDE.md`

The auto-managed header (Main + Manager inheritance summary) is regenerated every bootstrap. Do not edit between the BEGIN/END markers. Below those markers, customize freely:

- The repo path this leaf shadows (or "stub — no real repo yet").
- Leaf-specific commands (build, test, dev server).
- Leaf-specific tooling and MCPs.
- File-ownership rules within the leaf's repo (high caution / touch sparingly / free game).
