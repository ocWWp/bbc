# Memory File Schema

Every file under `memory/` MUST have YAML frontmatter matching this schema. Validation is informal in V1 (humans + LLMs check); a formal validator is a follow-on task.

## Frontmatter

```yaml
---
id: mem_<YYYY-MM-DD>_<short-slug>      # stable, unique, sortable
type: principle | fact | decision | runbook | glossary | rule
scope: org | product:tenant | repo:<name> | leaf:<name>
layer: main | manager | distribution
source: human:<who> | leaf:<name> | manager | external:<url>
created: <ISO-8601 UTC>
updated: <ISO-8601 UTC>
owning_layer: main | manager | distribution
supersedes: [<id>, ...]                 # optional
provenance: [<proposal_id>, ...]        # optional, appended on accept
tags: [<tag>, ...]
status: accepted | proposed | superseded | archived
---
```

### Field rules

- **id** — `mem_` prefix, ISO date, hyphen-slug. Once published, never change.
- **type** — pick one. Use `decision` for ADR-style records (`memory/decisions/`); use `principle` for top-level rules; `fact` for observations; `runbook` for procedures; `glossary` for term definitions; `rule` for enforceable constraints.
- **scope** — how broadly does this apply. `org` = company-wide; `product:tenant` = the the tenant's product; `repo:<<tenant-app-web>>` = single repo; `leaf:<name>` = single Distribution leaf only.
- **layer** — where the file lives in the trust hierarchy. Promoting a fact from leaf to org bumps both `layer` and `owning_layer`.
- **source** — where the fact came from. Lets us re-derive provenance.
- **owning_layer** — who can directly mutate this file (without going through the queue). Often equals `layer` but not always (e.g., a Manager-curated runbook in `memory/ops/` might have `layer: main, owning_layer: manager`).
- **supersedes** — if this file replaces older ones, list their ids. The replaced files get `status: superseded` and stay in place.
- **provenance** — appended automatically by `scripts/accept.sh` when a proposal modifies this file.
- **status** — start as `accepted` for direct writes; queue-born files start `proposed` and become `accepted` on dequeue.

### Body

After the frontmatter, write Markdown freely. Headings, lists, code blocks, `[[wikilinks]]` are all fine. Keep one fact per file when possible — it makes diff-review and supersession cleaner.

## File naming

`memory/<category>/<short-kebab-slug>.md`

Category is one of: `product`, `design`, `tech`, `ops`, `people`, `glossary`, `decisions`. The slug should be human-readable, not the id.

## Examples

See seed files in each category for canonical structure.
