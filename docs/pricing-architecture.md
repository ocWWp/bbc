# Pricing Architecture

How BBC keeps vendor pricing accurate when most vendors don't expose a pricing API.

## The honest landscape

Vendor pricing data lives in three tiers:

| Tier | Examples | What's available | BBC strategy |
|---|---|---|---|
| **A. Live API** | OpenAI, Anthropic, Google, Mistral, Meta-hosted (via OpenRouter) | Real-time JSON catalog | **Live fetch**, ≤24h cache |
| **B. Live API (vendor-direct)** | AWS, GCP, Azure | Official pricing APIs (huge JSON catalogs) | **Live fetch**, 7d cache (catalogs are stable) |
| **C. Scrape / manual** | Cloudflare, Supabase, Neon, Vercel, Resend, PostHog, Railway, Fly, Render | Pricing pages only | **YAML-cached** + `last_verified_at` + scheduled refresh job |

There is no single API that covers everything. Anyone who promises one is either scraping behind the scenes or limiting themselves to a slice. BBC is honest about this — every price the dashboard shows comes with a **freshness badge** so the user can see what they're trusting.

## The data model

Each `memory/ops/providers/<vendor>.yaml` declares its pricing source and the unit/amounts. Example for an LLM provider (live source):

```yaml
# memory/ops/providers/example-llm-provider.yaml
id: example-llm-provider
type: provider
role: llm-provider

pricing:
  source: "openrouter:anthropic/claude-sonnet-4.6"   # tier A, live
  units:
    - { name: input_tokens,  per: 1_000_000, currency: usd }
    - { name: output_tokens, per: 1_000_000, currency: usd }
  # When source is live, `amount_usd` is omitted and the pricing package fills it in.

  refresh_interval_hours: 24
  fallback_amount_usd:
    input_tokens:  3.00     # used if live fetch fails; updated nightly by CI
    output_tokens: 15.00
  last_verified_at: "2026-05-10"
  sources:
    - "https://openrouter.ai/anthropic/claude-sonnet-4.6"
    - "https://anthropic.com/pricing"
```

Example for a manual-priced provider:

```yaml
# memory/ops/providers/example-email-delivery.yaml
pricing:
  source: "manual"
  units:
    - { name: emails_sent, per: 1_000, amount_usd: 1.00, currency: usd }
    - { name: monthly_minimum, amount_usd: 0.00, currency: usd }
  refresh_interval_hours: 720    # 30 days — manual sources only need quarterly refresh
  last_verified_at: "2026-05-10"
  sources:
    - "https://resend.com/pricing"
```

The `units` shape is intentionally flexible — anything that maps to "X amount per Y unit" works (per-token, per-request, per-GB-bandwidth, per-seat-month, monthly-flat).

## The pricing package

`packages/pricing/` (to be built — first slice of the upcoming work):

```ts
import { getPricing } from "@bbc/pricing";

const price = await getPricing("example-llm-provider");
// → { units: [{name, per, amount_usd, currency}, …],
//     source: "openrouter:anthropic/claude-sonnet-4.6",
//     fetched_at: "2026-05-10T14:23:00Z",
//     freshness: "live" | "cached" | "stale",
//     fallback_used: false }
```

Adapters:
- `openrouter-llm` — `GET https://openrouter.ai/api/v1/models`, picks the model by slug
- `aws-pricing` — uses the AWS Price List Bulk API (`https://pricing.{region}.amazonaws.com/offers/v1.0/aws/{service}/...`)
- `gcp-billing` — Cloud Billing Catalog API (requires API key; works on free tier)
- `azure-retail` — Azure Retail Prices API (`https://prices.azure.com/api/retail/prices`)
- `manual` — reads from the yaml directly

24h memory cache + persistent JSON cache at `data/pricing-cache.json` (gitignored, but the operator can ship an initial cache so cold starts don't hammer APIs).

## Freshness badge in the UI

When the dashboard shows a price, it badges the freshness:

| Badge | Meaning | When |
|---|---|---|
| 🟢 `live` | Fetched from a vendor API in the last 24h | Tier A/B sources, recent fetch |
| 🟡 `cached` | Fetched within the last 7 days | Tier A/B with stale cache; or tier C within `refresh_interval_hours` |
| 🟠 `stale` | Older than the source's `refresh_interval_hours` | Manual source past its quarterly refresh; or live source where fetch has failed for >7d |
| 🔴 `fallback` | Live fetch failed, using `fallback_amount_usd` | Network or API outage |

Hovering reveals: source URL, last fetched, fallback status, and a "Verify now" link that opens the vendor's pricing page in a new tab.

## CI refresh job

A scheduled GitHub Action (`.github/workflows/refresh-pricing.yml`, nightly at 03:00 UTC):

1. Calls every provider's pricing source
2. Compares the live amount to the yaml's `fallback_amount_usd`
3. If the delta is >5% on any unit, opens a PR titled `chore(pricing): vendor X changed N% (input_tokens)` with the diff
4. Updates the cache file in the same PR

This means even pure-yaml providers eventually get updates pushed to them — without the operator having to remember to check.

## What this means for the cost calculator

When the user is on the `/onboarding/services` page picking vendors:

- LLM picker: shows real-time per-token costs (OpenRouter live)
- Compute picker: shows real-time AWS/GCP/Azure costs by region + instance type
- SaaS picker (Resend, PostHog, Vercel, etc.): shows yaml-cached costs with a freshness badge

The "estimated monthly cost" total at the bottom is the sum of `selected_vendors × user_inputs[expected_volume]`. Inputs ask the user for the obvious dimensions: expected MAU, expected req/sec, expected emails/month, etc. — populated with sensible defaults.

For self-hosters, the calculator outputs:
- A `bindings.yaml` template with their picks
- An `.env.local` template with the env-var names each vendor needs
- A markdown checklist of "go register an account at X, paste keys here"

For hosted-tier users, the calculator outputs:
- A provisioning request (BBC SaaS creates the accounts, manages the credentials, bills through Stripe)

## What's NOT in scope

- **Real-time billing reconciliation** — BBC doesn't try to be Vantage or Cloudability. We show *projected* costs based on user-declared volume; the actual bill comes from each vendor.
- **Discount/contract pricing** — only public pricing. Enterprise users with negotiated rates can override `amount_usd` in their tenant repo's `bindings.yaml`.
- **Currency conversion** — all prices in USD. Non-USD presentation is a follow-up.

## See also

- [`memory/ops/provider-roles/`](../memory/ops/provider-roles/) — what each role contract requires
- [`memory/ops/providers/`](../memory/ops/providers/) — provider adapter examples (will gain `pricing:` blocks)
- [`docs/operating-bbc.md`](./operating-bbc.md) — operator playbook
- [`docs/tenant-repo-architecture.md`](./tenant-repo-architecture.md) — skeleton + slot model
