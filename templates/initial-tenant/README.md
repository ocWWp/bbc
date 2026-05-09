# Initial Tenant Template

Files in this directory are the **seed content** that BBC bootstraps every new tenant with on signup.

When a stranger signs up at `bbc.tools` (or self-hosts) and creates a fresh BBC instance, the contents of this directory become their starting state — their CLAUDE.md, schema, sample memory entries, bindings, and one demo proposal in the queue.

## What goes here

- `CLAUDE.md` — Main precedence rules (verbatim from `bbc/CLAUDE.md` at template-bake time)
- `memory/_schema.md` — frontmatter schema for memory files
- `memory/decisions/` — sample ADRs (the BBC v1 ADR is a reasonable seed)
- `bindings.yaml` — default role→provider bindings (all unbound except db-provider, which a SaaS deployment can pre-bind to Supabase if appropriate)
- `queue/sample.md` — one demo proposal so the new tenant has something to look at in the queue

## Sync to / from the live BBC repo

These templates are stored as files (not in the DB) so they round-trip with the AGPL self-host story: cloning the BBC repo gives you a working bootstrap. The `create_tenant_with_seed()` SQL function (migration 0011) reads inline copies that are kept in sync via this template directory.

When you change a file here, also update the corresponding inline string in `apps/dashboard/supabase/migrations/0011_*.sql` (or the next migration that supersedes it). Drift is human-detected via a future CI check.

## Versioning

Template content evolves. The `tenants.plan` column doesn't yet capture template version, but that's the natural place to put it when the bootstrap is broken into versioned migrations.
