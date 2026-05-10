---
id: mem_2026-05-09_adr-0002-acme-pick-postgres
type: decision
scope: org
layer: main
source: human:alice
created: 2026-05-09T11:30:00Z
updated: 2026-05-09T11:30:00Z
owning_layer: main
tags: [adr, db-provider, vendor-bind]
status: accepted
provenance: [prop_2026-05-09T11-15-00Z_human-alice_bind-postgres-managed]
---

# ADR-0002: Bind db-provider to postgres-managed

## Context

ADR-0001 established Acme as a BBC tenant with `db-provider` initially unbound. We needed to pick a database provider before shipping any user-facing feature requiring persistence.

Options surveyed:
- Self-hosted Postgres on a VPS — operational overhead too high for a 3-person team.
- A managed Postgres provider — keeps Postgres semantics (which we know), removes ops burden.
- Firebase / Firestore — proprietary query model; lock-in concern.

## Decision

Bind `db-provider` to a **managed Postgres provider**. The specific vendor is captured in `memory/ops/bindings.yaml` as the `provider_id` (using one of the example-* placeholder adapters until we commit to a specific managed-Postgres vendor — likely Supabase or Neon).

## Consequences

- All Acme application code targets standard Postgres (no vendor-specific extensions beyond `pgcrypto` and `uuid-ossp`).
- We retain `bbc-provider:example-db-provider` as the call-site tag (see F4-build-2 convention) so swapping vendors later is a tag-grep + binding-flip operation.
- We bind a SECOND role `auth` to the same provider since Postgres-managed services bundle auth (RLS-friendly).

## Provenance

Proposed via the queue on 2026-05-09. Manager reviewed (rule: vendor binding requires explicit ADR). Accepted by Alice (admin, sole admin at the time of this writing). See `queue/_accepted/2026-05-09_acme-bind-postgres.md` for the full proposal.

## Source

`memory/ops/bindings.yaml` is updated atomically as part of the accept. This file documents the WHY; bindings.yaml documents the WHAT.
