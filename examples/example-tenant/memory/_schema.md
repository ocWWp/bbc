# Memory File Schema (Acme Co)

This is the BBC standard frontmatter schema, inherited verbatim. Every file under `memory/` MUST have YAML frontmatter matching this.

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
- **type** — pick one. Use `decision` for ADRs, `principle` for top-level rules, `fact` for observations, `runbook` for procedures, `glossary` for terms, `rule` for enforceable constraints.
- **scope** — how broadly this applies.
- **layer** — where the file lives in the trust hierarchy.
- **owning_layer** — who can directly mutate this file (without queue).
- **status** — `accepted` for direct writes; queue-born files become accepted on dequeue.

### Body

Markdown freely. Headings, lists, code blocks, `[[wikilinks]]` are all fine. Keep one fact per file when possible — it makes diff-review and supersession cleaner.

## File naming

`memory/<category>/<short-kebab-slug>.md`

Category is one of: `product`, `design`, `tech`, `ops`, `people`, `glossary`, `decisions`.
