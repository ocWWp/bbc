# Memory File Schema

Every file under `memory/` MUST have YAML frontmatter matching this schema. Validation is informal in V1 (humans + LLMs check); a formal validator is a follow-on task.

## Frontmatter

```yaml
---
id: mem_<YYYY-MM-DD>_<short-slug>      # stable, unique, sortable
type: principle | fact | decision | runbook | glossary | rule | observation
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
- **type** — pick one. Use `decision` for ADR-style records (`memory/decisions/`); use `principle` for top-level rules; `fact` for static observations captured manually; `runbook` for procedures; `glossary` for term definitions; `rule` for enforceable constraints; `observation` for **Loop 3 observer findings** generated against external signal adapters (per ADR-0009 v1.6 amendment) — lands at `memory/observations/<observer_run_id>.md`, requires the extra frontmatter fields below.
- **scope** — how broadly does this apply. `org` = company-wide; `product:tenant` = the the tenant's product; `repo:<<tenant-app-web>>` = single repo; `leaf:<name>` = single Distribution leaf only.
- **layer** — where the file lives in the trust hierarchy. Promoting a fact from leaf to org bumps both `layer` and `owning_layer`.
- **source** — where the fact came from. Lets us re-derive provenance.
- **owning_layer** — who can directly mutate this file (without going through the queue). Often equals `layer` but not always (e.g., a Manager-curated runbook in `memory/ops/` might have `layer: main, owning_layer: manager`).
- **supersedes** — if this file replaces older ones, list their ids. The replaced files get `status: superseded` and stay in place.
- **provenance** — appended automatically by `scripts/accept.sh` when a proposal modifies this file.
- **status** — start as `accepted` for direct writes; queue-born files start `proposed` and become `accepted` on dequeue.

### Extra fields required for `type: observation` (v1.6+)

Files with `type: observation` MUST carry these additional frontmatter fields:

```yaml
observer_run_id: <uuid>              # FK into observer_runs.id — the run that produced this finding
signal_source: <capability-class>.<implementation>   # e.g., posthog.metric
signal_id: <uuid>                    # FK into observer_signals.id
anomaly_summary:
  metric: <string>                   # what the signal watched (e.g., "weekly-active-users")
  delta: <number>                    # observed change vs baseline (signed; can be percentage or raw)
  delta_units: <string>              # "ratio" | "percent" | "absolute"
  z_score: <number>                  # Z-score that triggered the proposal (informational; v1.6 uses Z-score only)
baseline_window:
  current_start: <ISO-8601 UTC>
  current_end: <ISO-8601 UTC>
  baseline_start: <ISO-8601 UTC>
  baseline_end: <ISO-8601 UTC>
citations: [<memory_id>, ...]        # memory IDs the agent's hypothesis cites; verified by GroundingVerifier
```

Why a dedicated supertag, not `fact`? Three reasons:

1. **Different review lens.** A `fact` is a stable assertion about the world; an `observation` is a time-bounded anomaly hypothesis. Reviewers should know the difference at a glance.
2. **Different cascade behavior.** If the parent `observer_runs` row is purged at end-of-retention, the `observation` memory row can survive as durable knowledge — but only if it was reviewed and accepted. Type lets queries and cleanup distinguish.
3. **Distinct frontmatter shape.** The five fields above don't fit cleanly on `fact` or `note` (which doesn't even exist in this schema — ADR-0008 referenced it informally; v1.6's `observation` is the concrete realization).

Note that `proposed` status for `observation` rows is **handled by the queue** — no `memory_files` row exists with `status='proposed'` for observations. The row is created only after `accept_proposal_observation()` runs (per migration 0047, M3.4 of the v1.6 plan). This means an `observation` memory file always has `status='accepted'` or `status='archived'` (post-rejection cleanup of the staged_finding) — never `proposed`. Codex review of the v1.6 design flagged the "proposed memory rows leaking into citations" risk; this convention closes it.

### Body

After the frontmatter, write Markdown freely. Headings, lists, code blocks, `[[wikilinks]]` are all fine. Keep one fact per file when possible — it makes diff-review and supersession cleaner.

## File naming

`memory/<category>/<short-kebab-slug>.md`

Category is one of: `product`, `design`, `tech`, `ops`, `people`, `glossary`, `decisions`, `observations`. The slug should be human-readable, not the id. For `type: observation`, the slug is the `observer_run_id` (UUID) so the file path encodes the audit linkage — see `apps/dashboard/supabase/migrations/0047_accept_observation_proposal.sql` (M3.4).

## Examples

See seed files in each category for canonical structure.
