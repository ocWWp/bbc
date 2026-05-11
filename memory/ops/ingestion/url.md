---
id: mem_2026-05-11_ops-ingestion-url
type: fact
scope: org
layer: manager
source: human:oscar
created: 2026-05-11T00:00:00Z
updated: 2026-05-11T00:00:00Z
owning_layer: manager
tags: [ops, ingestion, sources, trust, ssrf]
status: accepted
---

# Ingestion policy — url

**Trust tier:** medium. User-attested, but the content is third-party — the user chose to point at it, didn't author it.

**Expected fact shape:** product positioning, voice, decisions, glossary terms, vendor mentions. Less common: team rosters (rare on public pages).

**Default acceptance:** always human review via the proposal queue. The extractor receives a `<source channel="url" location="…" />` tag so it can adjust trust (e.g., be skeptical of positioning claims sourced from a competitor's blog).

**Adapter guarantees (see `apps/dashboard/src/lib/ingestion/adapters/url.ts`):**
- `https?` only — no `file://`, no `gopher://`, no `data:` URIs.
- Hostname-based block for `10.*`, `172.16-31.*`, `192.168.*`, `169.254.*`, `127.*`, `0.0.0.0`, `localhost`.
- 1 MB body cap (checked both via `content-length` and post-read).
- 10 s fetch timeout (`AbortController`).
- Content-type allow-list: `text/html`, `text/plain`, `application/xhtml`.
- `User-Agent: BBC-Ingestion/1.0 (+https://bigbrain.company)`.

**Known residual risk:** DNS rebinding. ADR-0005 accepts this for v1; mitigation is per-tenant rate limiting (not yet implemented). Do not loosen the hostname-based block without revisiting that ADR.
