---
id: mem_2026-05-11_ops-ingestion-file
type: fact
scope: org
layer: manager
source: human:oscar
created: 2026-05-11T00:00:00Z
updated: 2026-05-11T00:00:00Z
owning_layer: manager
tags: [ops, ingestion, sources, trust]
status: accepted
---

# Ingestion policy — file

**Trust tier:** medium. User-attested by virtue of dragging it into the dropzone; provenance depends on file kind.

**Expected fact shape:** depends on the file.
- `README.md` → product, vendor, sometimes voice
- design / brand doc → voice, glossary
- decision log → decision (one per entry)
- meeting notes → team mentions, decisions

**Default acceptance:** always human review via the proposal queue.

**Adapter guarantees (see `apps/dashboard/src/lib/ingestion/adapters/file.ts`):**
- Extension allow-list: `.md`, `.markdown`, `.txt`.
- 1 MB byte cap.
- UTF-8 decode (non-fatal — replaces invalid sequences rather than rejecting).
- 50,000 char truncation marker propagated to the source row's locator.

**Deferred:** PDF ingestion (v1.21+). Scanned PDFs need a real parser; trying to handle them with regex-on-bytes would be silently lossy and erode trust in the brain.
