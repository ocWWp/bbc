---
id: mem_2026-05-09_acme-vendors
type: fact
scope: org
layer: main
source: human:alice
created: 2026-05-09T11:35:00Z
updated: 2026-05-09T11:35:00Z
owning_layer: main
tags: [vendors, ops, transitional]
status: accepted
---

# Vendors

This file is intentionally short. Per BBC's principle 4 ("vendor names are not architecture"), the canonical record of which vendor is bound to which role is `memory/ops/bindings.yaml`. The provider adapter YAMLs in `memory/ops/providers/` describe each vendor's shape.

Look there:
- `memory/ops/bindings.yaml` — what's bound today.
- `memory/ops/providers/example-*-provider.yaml` — what each adapter looks like (these are placeholder examples until Acme commits to specific vendors).

When we swap a vendor (or pick our first one for an unbound role), the change goes through the queue.
