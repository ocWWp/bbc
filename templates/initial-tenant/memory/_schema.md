# Memory File Schema

Every file under `memory/` MUST have YAML frontmatter matching this schema.

## Frontmatter

```yaml
---
id: mem_<YYYY-MM-DD>_<short-slug>      # stable, unique, sortable
type: principle | fact | decision | runbook | glossary | rule
scope: org | product:<name> | repo:<name> | leaf:<name>
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
- **type** — pick one. Use `decision` for ADR-style records, `principle` for top-level rules, `fact` for observations, `runbook` for procedures, `glossary` for term definitions, `rule` for enforceable constraints.
- **scope** — how broadly does this apply.
- **layer** — where the file lives in the trust hierarchy.
- **source** — where the fact came from. Lets us re-derive provenance.
- **owning_layer** — who can directly mutate this file (without going through the queue).
- **supersedes** — if this file replaces older ones, list their ids.
- **provenance** — appended automatically when a proposal modifies this file.
- **status** — start as `accepted` for direct writes; queue-born files become `accepted` on dequeue.

### Body

After the frontmatter, write Markdown freely. Keep one fact per file when possible — it makes diff-review and supersession cleaner.

## File naming

`memory/<category>/<short-kebab-slug>.md`

Suggested categories: `product`, `design`, `tech`, `ops`, `people`, `glossary`, `decisions`.
