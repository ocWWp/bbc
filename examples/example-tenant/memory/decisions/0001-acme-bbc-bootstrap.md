---
id: mem_2026-05-09_adr-0001-acme-bootstrap
type: decision
scope: org
layer: main
source: human:alice
created: 2026-05-09T10:00:00Z
updated: 2026-05-09T10:00:00Z
owning_layer: main
tags: [adr, bootstrap, v1]
status: accepted
---

# ADR-0001: Acme Co adopts BBC as the company brain

## Context

Acme Co is a 3-person SaaS startup. As we shipped MVP, decisions accumulated in Slack DMs, Notion pages, and individual heads. We needed a single, agent-readable source of truth that scales as we hire.

We considered:
- Notion + a heavy templating discipline → too easy to drift, agents struggle with the API.
- Custom markdown repo with no protocol → the structure rots within 3 months.
- BBC → markdown + a precedence hierarchy + queued change protocol. Solves the drift problem with mechanism, not discipline.

## Decision

Adopt BBC's three-layer governance protocol (Main > Manager > Distribution) for managing Acme's company brain — facts, decisions, runbooks, voice, and operations.

## Consequences

- All durable knowledge lives in `memory/` (schema in `memory/_schema.md`).
- Cross-layer changes go through the queue (`bash ../../scripts/propose.sh ...` then accept/reject).
- Vendor names are abstracted behind roles (`db-provider`, `llm-provider`, …); see `memory/ops/bindings.yaml`.
- The dashboard at the BBC URL is our operational surface; agents (Claude Desktop, Cursor) connect via the BBC MCP server.

## Source

This bootstrap decision was made on 2026-05-09 by Alice (Acme's CEO) after a 30-min team review. See `memory/people/team.md`.

## Next step

ADR-0002 records our first vendor binding decision (db-provider → postgres-managed). Future decisions reference this ADR via `supersedes` if they evolve the principle.
