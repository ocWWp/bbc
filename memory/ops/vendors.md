---
id: mem_2026-05-08_ops-vendors
type: fact
scope: org
layer: main
source: human:zeth
created: 2026-05-08T00:00:00Z
updated: 2026-05-08T00:00:00Z
owning_layer: main
tags: [vendors, ops, providers, transitional]
status: accepted
supersedes_use_of_vendors_in_prose: true
---

# Vendors — transitional human-readable view

> **As of F4-build-1 (2026-05-08), this file is a transitional human-readable summary.**
> The canonical sources are now:
> - **Role contracts:** `memory/ops/provider-roles/<role>.yaml`
> - **Adapter declarations:** `memory/ops/providers/<provider>.yaml`
> - **Active bindings:** `memory/ops/bindings.yaml`
>
> See `manager/rules/no-vendor-names-in-prose.md` for where vendor names may and may not appear elsewhere in BBC.

## Active bindings (read from `bindings.yaml`)

| Role | Vendor | Wired in |
|---|---|---|
| llm-provider | anthropic-claude-sonnet | `8azi-api/app/shared/llm/` |
| db-provider | supabase | `8azi-api`, `8azi-web` |
| web-host | cloudflare-workers | `8azi-web/wrangler.toml` |
| api-host | railway | `8azi-api/Dockerfile` + Railway project |
| email-delivery | resend | weekly reading email |
| subscription-receipt | revenuecat | mobile app |
| analytics | posthog (provisional) | candidate; not yet emitting events |
| design-source | figma | via MCP |
| pattern-reference | mobbin | via MCP |
| image-edit-provider | (unbound) | — |
| video-gen-provider | (unbound) | — |

## Considered but not wired

`n8n`, `Zapier`, `Buffer`. Mentioned in product discussions; no code or config in any repo as of 2026-05-08.

## Migration note

Anything that previously read this file as the source of truth should now read `memory/ops/bindings.yaml` (machine-parseable) and the adapter YAMLs. This file will be archived after F4-build-2 (consumer-code tagging) confirms nothing else depends on it.
