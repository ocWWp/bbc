---
id: mem_2026-05-08_ops-deployment-targets
type: fact
scope: org
layer: main
source: human:zeth
created: 2026-05-08T00:00:00Z
updated: 2026-05-08T00:00:00Z
owning_layer: main
tags: [deployment, hosting, domain, dns, subdomains]
status: proposed
---

# Deployment Targets — DNS, hosting, subdomains for BBC SaaS

Companion to ADR-0004 and `tech/repo-structure.md`. Records the domain + hosting layout decisions for the SaaS deployment of BBC.

## Primary domain

**`bbc.tools`** (DNS-checked 2026-05-08; possibly available — verify on registrar before purchase). Decision rationale:
- Clean, dev-tool framing.
- Short, easy to type, easy to say.
- `.tools` TLD reads as the right category for a brain protocol.
- Avoids the `bbc.<news-domain>` collision risk by leaning into a TLD where British Broadcasting has no presence.

Backup picks if `bbc.tools` is unavailable at registrar-check: `bbcprotocol.com` (most descriptive, best SEO), `bbcbrain.com` (on-brand). Off the table (registered): `bbc.dev`, `bbc.app`, `bbc.tech`, `bbc.io`.

## Subdomain layout

| Subdomain | Purpose | Hosted on | Phase |
|---|---|---|---|
| `bbc.tools` | Marketing landing + pricing | Vercel (same repo, marketing routes) | 11 |
| `app.bbc.tools` | Dashboard SaaS (signed-in users live here) | Vercel | 9 |
| `docs.bbc.tools` | Docs site (Mintlify or Docusaurus) | Vercel or Mintlify-hosted | 11 |
| `auth.bbc.tools` | Supabase custom auth domain (OAuth callbacks, email links) | Supabase Pro feature | 9 |
| `mcp.bbc.tools` | MCP server HTTP endpoint (per-tenant API keys) | Same long-lived host as the dashboard, OR separate Fly/Railway | 6 |

Each subdomain gets its own Vercel project (or its own deployment unit), so they scale and version independently. The `bbc.tools` apex serves the marketing site; everything functional lives behind a subdomain.

## Hosting providers (by surface)

| Surface | Provider | Plan | Notes |
|---|---|---|---|
| Dashboard (`app.bbc.tools`) | Vercel | Free → Pro when traffic warrants | Next.js native; Edge runtime fine after Phase 2 (no fs/exec) |
| Marketing (`bbc.tools`) | Vercel | Free | Same repo, separate route group OR separate project |
| Docs (`docs.bbc.tools`) | Vercel or Mintlify | Free → starter | Mintlify is faster to ship if it fits the doc style |
| MCP server (`mcp.bbc.tools`) | Fly.io OR Railway | $5–10/mo | Long-lived process; need server runtime, not edge |
| Database + Auth | Supabase Pro | $25/mo + $10/proj | Custom domain + custom SMTP + PITR |
| Email (transactional) | Resend | Free → Pro | Replaces Supabase default SMTP |
| Errors (Phase 11) | Sentry | Free → Team | Optional polish |
| Billing | Stripe | Per-transaction | Standard SaaS wiring |

## DNS records to create at registrar

When `bbc.tools` is purchased:

```
A      bbc.tools           76.76.21.21        # Vercel apex
CNAME  app.bbc.tools       cname.vercel-dns.com.
CNAME  docs.bbc.tools      cname.vercel-dns.com.   # or mintlify.app.
CNAME  auth.bbc.tools      <project-ref>.supabase.co.
CNAME  mcp.bbc.tools       <fly-app>.fly.dev.       # or railway.app
TXT    bbc.tools           "v=spf1 include:_spf.resend.com ~all"
MX     bbc.tools           ...                        # Resend or Google Workspace
```

Detailed values resolve during Phase 9.

## Reserved subdomains (do not use for product surfaces)

- `status.bbc.tools` — reserved for future status page (BetterStack, etc.)
- `blog.bbc.tools` — reserved for future content marketing
- `api.bbc.tools` — reserved (REST API alternative to MCP if MCP adoption is slow)
- `*.localhost.bbc.tools` — reserved for local dev tunnels (mkcert + ngrok pattern)

## Out of scope

- Specific Vercel project names (resolves at Phase 9).
- DNSSEC / DMARC config (Phase 11 polish).
- Status page provider choice (deferred until incidents matter).
