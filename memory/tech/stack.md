---
id: mem_2026-05-08_tech-stack
type: fact
scope: org
layer: main
source: human:zeth
created: 2026-05-08T00:00:00Z
updated: 2026-05-08T00:00:00Z
owning_layer: main
tags: [stack, infra]
status: accepted
---

# Tech Stack

What each surface is built on (frameworks/languages) and which provider role serves it.

| Surface | Framework / language | Provider role |
|---|---|---|
| Mobile | React Native (Expo + EAS Build) | n/a (binary distribution) |
| Web | Next.js | `web-host` |
| API | FastAPI (Python) | `api-host` |
| Persistence + Auth | (built on the bound `db-provider`) | `db-provider` |
| LLM | direct SDK call | `llm-provider` |
| Mobile subscriptions | (mobile SDK + server validation) | `subscription-receipt` |
| Email | (server SDK call) | `email-delivery` |
| Product analytics | (client + server SDKs) | `analytics` |
| Design source | (MCP-mediated lookup) | `design-source` |
| Pattern reference | (MCP-mediated lookup) | `pattern-reference` |

## Where to find which vendor currently fills each role

`memory/ops/bindings.yaml` is the canonical role-to-vendor binding table. Adapter declarations (`memory/ops/providers/<provider>.yaml`) carry per-vendor metadata.

## What this file is for

Quick orientation: which framework backs each surface, and which provider role serves it. The role names are stable; the vendors are not. To swap a vendor, follow F4's Announce → Quarantine → Purge protocol — not a hand edit here.

## What this file is NOT for

- Not a vendor list. See `bindings.yaml` for that.
- Not a candidate-evaluation log. New candidates → ADRs in `memory/decisions/`.
- Not a runbook. Per-vendor wire-up details live in the adapter YAMLs.
