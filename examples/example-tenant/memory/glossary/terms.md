---
id: mem_2026-05-09_acme-glossary
type: glossary
scope: org
layer: main
source: human:alice
created: 2026-05-09T09:30:00Z
updated: 2026-05-09T09:30:00Z
owning_layer: main
tags: [glossary, vocabulary]
status: accepted
---

# Glossary — Acme Co

Terms used across Acme's docs and code. Add a row when a term shows up in three+ places without a shared definition.

| Term | Meaning at Acme |
|---|---|
| **audit-trail** | The append-only log of accept/reject/propose/role-change actions. Lives in `_log/operations.jsonl` (file-mode) or `operations_log` table (DB-mode). See BBC docs. |
| **binding** | A row in `memory/ops/bindings.yaml` mapping a role (`db-provider`, `llm-provider`, …) to a specific vendor adapter. |
| **layer** | One of Main / Manager / Distribution. Determines who can edit what without going through the queue. |
| **leaf** | A Distribution-layer subdirectory under `distribution/<name>/`, governing a specific workstream or repo. |
| **proposal** | A queued change. Lives in `queue/<timestamp>_*.md` until accepted (moves to `queue/_accepted/`) or rejected (`queue/_rejected/`). |
| **propose-accept-reject** | The three-step write protocol for cross-layer changes. |
| **role contract** | The spec for what a role does (e.g., `memory/ops/provider-roles/db-provider.yaml` in BBC). Defines what operations a binding must support. |
| **the brain** | Acme's term for "this BBC instance." Used in agent prompts: "check the brain for our voice spec before drafting." |

This file is fictional — substitute terms specific to your tenant when forking.
