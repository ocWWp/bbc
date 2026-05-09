---
id: mem_TEMPLATE_DATE_adr-0001-tenant-bootstrap
type: decision
scope: org
layer: main
source: human:TEMPLATE_OWNER
created: TEMPLATE_DATE
updated: TEMPLATE_DATE
owning_layer: main
tags: [adr, bootstrap, v1]
status: accepted
---

# ADR-0001: Bootstrap this BBC instance

## Context

This BBC instance was created as a fresh tenant from the BBC product templates. The seed includes Main precedence rules, a memory schema, default (unbound) provider bindings, and one sample queue item demonstrating the propose-accept loop.

## Decision

Adopt BBC's three-layer governance protocol (Main > Manager > Distribution) for managing this organization's brain — facts, decisions, runbooks, voice, and operations.

## Consequences

- All durable knowledge lives in `memory/` (schema in `memory/_schema.md`).
- Cross-layer changes go through the queue (propose → review → accept/reject).
- Vendor names are abstracted behind roles (`memory/ops/vendors.md` becomes the single source of truth as you add providers).
- The dashboard at the BBC URL will be the operational surface; agents can connect via the BBC MCP server (when ready).

## Source

`templates/initial-tenant/memory/decisions/0001-bbc-tenant-bootstrap.md` (BBC product template).

## Next step

Replace the placeholder values (TEMPLATE_DATE, TEMPLATE_OWNER) with real values via the dashboard or the SQL function that seeded this tenant. Then write your first real decision.
