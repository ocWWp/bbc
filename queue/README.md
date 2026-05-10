# Queue Protocol

The queue is BBC's only write path for changes that cross layer ownership. Distribution leaves cannot edit Main- or Manager-owned files directly; Manager cannot edit Main-owned files directly. To make such a change, write a proposal here.

## Layout

```
queue/
├── <ISO-timestamp>__leaf-<name>__<short-slug>.md   # pending proposals (top level)
├── _accepted/                                       # archived approvals
└── _rejected/                                       # archived rejections
```

A proposal is **pending** while it sits at the top level of `queue/`. A human running `scripts/accept.sh <id>` or `scripts/reject.sh <id> --reason "<why>"` moves it to the appropriate archive directory.

## Filename rules

```
<ISO-timestamp>__<originator>__<short-slug>.md
```

- `<ISO-timestamp>` — `YYYY-MM-DDTHH-MM-SSZ` (colons replaced with hyphens for filesystem safety).
- `<originator>` — `leaf-<name>` or `manager`.
- `<short-slug>` — kebab-case, ≤ 40 chars, describes the change.

Example: `2026-05-08T12-04-32Z__leaf-<tenant-app-web>__rule-voice-emoji.md`

## How to invoke `propose.sh`

`propose.sh` infers `--originator` from `$PWD`. **You must `cd` into the leaf or manager directory first**, or pass `--originator` explicitly:

```bash
# From inside a leaf
cd bbc/distribution/<leaf>/
bash ../../scripts/propose.sh --target main --file <path> --kind <kind> \
  --summary "<short>" --source "<who said>" --body-file <path>

# From repo root with explicit originator
cd bbc/
bash scripts/propose.sh --target manager --file <path> --kind <kind> \
  --summary "<short>" --source "<who said>" --originator manager --body-file <path>
```

Running from the repo root without `--originator` will error.

## Frontmatter

Every proposal has YAML frontmatter:

```yaml
---
proposal_id: prop_<ISO-timestamp>_<originator>_<slug>   # matches filename, with prop_ prefix
proposed_by: leaf:<name> | manager
proposed_at: <ISO-8601 UTC>
target_layer: main | manager
target_file: <relative path from repo root>
change_kind: edit | add | supersede | archive
dest_file: <relative path>      # REQUIRED iff change_kind: archive (move target → dest)
diff_summary: "<short, single line>"
source: "<who/what said so>"   # leaf observation, human directive, or external link
status: pending | accepted | rejected
---
```

The `source:` field is required by `manager/rules/proposal-review.md`. `propose.sh` will warn if you omit `--source` and fall back to a weak default (Manager may request changes).

After Manager review (see `manager/agents/queue-reviewer.md`), a `manager_review:` block is appended:

```yaml
manager_review:
  reviewer: manager
  reviewed_at: <ISO-8601>
  verdict: approved | changes_requested | rejected
  notes: "<short>"
```

For cross-leaf-impacting proposals, a `cross_leaf_impact:` block is also appended (see `manager/agents/leaf-coordinator.md`).

For promotion proposals (leaf → Main `add`), a `promotion_check:` block is appended (see `manager/agents/memory-curator.md`).

## Body format by `change_kind`

### `edit`

Body is a unified diff against the target file:

````markdown
```diff
--- a/memory/design/voice-tone.md
+++ b/memory/design/voice-tone.md
@@
- Speak in second person to the reader.
+ Speak in second person to the reader. No emoji in marketing copy.
```
````

### `add`

Body is the full new file content (frontmatter + body) inside a fenced code block:

````markdown
```markdown
---
id: mem_2026-05-08_new-thing
type: fact
...
---

# New Thing

Body here.
```
````

The `target_file` should be the path where this new file will be written.

### `supersede`

Body cites the file being superseded by id and explains why. Optionally includes a replacement body inline (otherwise a separate `add` proposal precedes the supersede).

For `type: provider-adapter` targets, accept.sh sets terminal `status: archived` (matches F4 enum). For other types, terminal status is `superseded`.

### `archive`

Move a file from `target_file` (source) to `dest_file` (destination), stamp `status: archived` and `archived_at: <ts>` in the moved file, and append the proposal to `provenance:`. Designed for the F4 decommission Purge phase: provider YAMLs move from `memory/ops/providers/<id>.yaml` → `memory/ops/providers/_archived/<id>.yaml`.

Body is free-form prose explaining the archive reason. No diff or markdown block needed.

```yaml
change_kind: archive
target_file: memory/ops/providers/mobbin.yaml
dest_file:   memory/ops/providers/_archived/mobbin.yaml
```

Refused if `dest_file` already exists, if `target_file` doesn't exist, or if `dest_file` is missing from frontmatter.

## Lifecycle

```
write proposal  ──▶  pending in queue/  ──▶  manager_review appended  ──▶  accept.sh or reject.sh
                                                                              │
                                                                              ├─ accept: diff applied to target_file,
                                                                              │  proposal moved to queue/_accepted/,
                                                                              │  target_file's frontmatter updated:
                                                                              │    updated: <now>
                                                                              │    provenance: [<existing>, <proposal_id>]
                                                                              │
                                                                              └─ reject: proposal moved to queue/_rejected/
                                                                                 with rejection_reason: appended.
```

Accepted and rejected proposals stay in their archive directories indefinitely. They are the audit trail.

## Concurrent proposals

Two proposals targeting the same file: V1 policy is **last manager-approved wins**. The second proposal gets `changes_requested` with note "rebase against `<first proposal_id>`." See `manager/rules/cross-leaf-sync.md`.
