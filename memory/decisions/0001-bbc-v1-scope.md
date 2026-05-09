---
id: mem_2026-05-08_adr-0001-bbc-v1-scope
type: decision
scope: org
layer: main
source: human:zeth
created: 2026-05-08T00:00:00Z
updated: 2026-05-08T00:00:00Z
owning_layer: main
tags: [adr, bbc, scope]
status: accepted
---

# ADR-0001: BBC V1 scope is markdown + hierarchy + queue only

## Context

BBC was first imagined as a full company brain — auto-tool selection, n8n auto-pipelines, dashboard, shadow brain, OOP skill inheritance. Designing all of that at once stalls execution and conflates orthogonal problems.

## Decision

V1 ships only the foundation: a 3-layer Claude.md hierarchy, a Markdown memory store with YAML frontmatter, and a file-based proposal queue. No daemons, no UI, no automation, no toolchain.

## Consequences

- We can build V1 in days, not months.
- Every later feature plugs into a known shape: anything new either reads memory, writes via the queue, or runs as a leaf-local extension.
- The four follow-on subsystems (F1–F4) get planned individually with full design depth instead of being half-baked into V1.

## Supersedes

n/a — first ADR.

## Source

`/Users/grid/.claude/plans/bb-c-in-plain-english-spicy-clock.md`
