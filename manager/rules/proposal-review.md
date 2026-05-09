# Rule: Proposal review

Manager checks every queued proposal against this rule before adding `manager_review:`.

## A proposal is well-formed if…

- [ ] Filename matches `<ISO-timestamp>__leaf-<name>__<short-slug>.md` (or `manager-<short-slug>` if Manager-originated).
- [ ] Frontmatter contains: `proposal_id`, `proposed_by`, `proposed_at`, `target_layer`, `target_file`, `change_kind`, `diff_summary`, `source`, `status: pending`.
- [ ] `target_layer` is one of `main` or `manager`. Distribution-targeted changes don't go through the queue (a leaf edits its own files directly).
- [ ] `change_kind` is one of `edit`, `add`, `supersede`, `archive`.
- [ ] `target_file` exists for `edit`/`supersede`/`archive`, or has a sensible new path for `add`.
- [ ] For `change_kind: archive`: `dest_file` is present in frontmatter and the file at that path does NOT yet exist.
- [ ] Body contains either a unified diff (for `edit`), a full new file body with frontmatter (for `add`), a citation of the file being superseded (for `supersede`), or a free-form archive rationale (for `archive`).
- [ ] `source` field is present. (`propose.sh` enforces this — emits a warning and falls back to a weak default if `--source` is omitted.)

## A proposal is reasonable if…

- It does not contradict any Main principle (Main wins; if reasonable conflict, the proposer should target Main with an ADR instead).
- The `source:` frontmatter field cites at least one of: a leaf observation, a human directive, an external link. Weak defaults like `"<originator> observation (no explicit source cited)"` are reason enough to set verdict to `changes_requested`.
- It is scoped — one logical change per proposal. Multi-change bundles get `changes_requested` with a request to split.

## Verdicts

| Verdict | Meaning | Next step |
|---|---|---|
| `approved` | Well-formed, reasonable, ready to apply. | Human at Main runs `scripts/accept.sh <id>`. |
| `changes_requested` | Needs revision. Leave the file in `queue/`. | Proposer rewrites and re-submits (same id, bumped timestamp), or a Manager edits in place if the fix is trivial. |
| `rejected` | Should not happen. | Human runs `scripts/reject.sh <id>` with a reason; file moves to `_rejected/`. |
