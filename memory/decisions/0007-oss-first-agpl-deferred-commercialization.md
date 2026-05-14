---
id: mem_2026-05-11_adr-0007-oss-first-agpl-deferred-commercialization
type: decision
scope: org
layer: main
source: human:oscar
created: 2026-05-11T00:00:00Z
updated: 2026-05-11T00:00:00Z
owning_layer: main
tags: [adr, bbc, licensing, monetization, governance, agpl]
status: accepted
supersedes: []
---

# ADR-0007: OSS-first, AGPLv3, deferred commercialization

## Context

BBC was originally scoped as a SaaS with a paid plan ladder, Stripe checkout, credit metering, and paywall triggers wired across the journey (design doc §11–§13, Phase K). On 2026-05-11, the maintainer (Oscar) raised a blocker: their current US visa status restricts them from receiving business income from a self-owned company in the United States. The original revenue plan is therefore not executable in v1.

Three responses to that blocker were considered:

1. **Take a US co-founder who legally holds the entity and receives revenue.** Equity split with a trusted party who has work authorization.
2. **Move jurisdiction.** Incorporate in a country where the maintainer can legally take income (Estonia e-Residency, Canada Startup Visa, etc.).
3. **Defer commercialization. Ship the product free + open-source. Preserve the right to commercialize later when status changes.**

Researched precedent (web-search-agent run 2026-05-11):

- **Mike Krieger (Instagram)** had to defer all paperwork authority to his US co-founder Kevin Systrom during 3+ months of visa limbo. Worked because Systrom was a good actor. Cautionary structure: the non-US founder has no signature authority during crises.
- **Eduardo Saverin (Facebook), Noah Glass (Twitter), Robin Chase (Zipcar)** — all diluted or pushed out by co-founders who legally controlled the entity. None were visa cases; the power asymmetry is the same.
- **Manu Kumar (K9 Ventures)** founded SneakerLabs on F-1 in 1996 by *owning equity passively, drawing no salary, doing no active work*, and activated the company on post-graduation OPT. Standard legal pattern for visa-constrained founders.
- **Cal.com** relicensed MIT → AGPLv3 in Sept 2021 explicitly to commercialize. Sells an Enterprise Edition alongside the free AGPL core. Possible because the relicensing happened early, before a fork-able permissive community formed.
- **Plausible Analytics** started AGPLv3 day one. Bootstrapped to $1M+ ARR on hosted cloud while keeping the self-host version copyleft. Same maintainer-friendly pattern.
- **HashiCorp (Terraform → BUSL 2023)** and **Elastic (Apache → SSPL 2021)** both attempted permissive-to-restrictive relicensing later in their lifecycles. Both got forked into community alternatives (OpenTofu, OpenSearch) within weeks. Lesson: if commercial optionality matters, *start* AGPL — don't try to flip permissive code later.

## Decisions

### D1. License

BBC is **AGPLv3** as of the project's existing `LICENSE` file. The license stays AGPLv3 in v1. No commercial license clause is added, no dual-licensing is offered, and no contributor license agreement (CLA) is required from external contributors in v1.

### D2. No monetization layer in v1

Phase K is **rewritten** (commit on `phase-j-marketing-studio`, see design doc §12). Specifically removed from v1 scope:

- Stripe Checkout + Customer Portal + webhooks
- Credit metering / token-passthrough accounting
- Paywall triggers across the journey
- Plan ladder (Free / Solo Founder / Team / Org)
- "Paid conversions" success metric

What stays in Phase K, rebranded as **"BYOK onboarding + marketplace + MCP writes"**:

- Bring-your-own-key onboarding (Anthropic key, Supabase URL) wired into `/welcome`
- `/marketplace` as a *provider directory* with bind/unbind to `bindings` rows
- MCP write tools via the queue protocol
- One-click "Deploy to Vercel" self-host template
- A hosted demo at bbc.tools with per-IP daily caps, treated as a marketing-budget expense

### D3. Hosted demo is a marketing expense, not a product

The hosted instance at bbc.tools exists so people can try BBC before self-hosting. Funded by the maintainer personally as a marketing line. Hard daily cap on Anthropic spend; demo auto-disables for the day if the cap is hit; on-screen copy directs users to self-host for unlimited usage. The hosted demo is **not a SaaS** — there is no per-user plan, no credit pool, no billing relationship with the user.

### D4. Commercialization is deferred, not foreclosed

AGPLv3 was chosen precisely so the maintainer retains commercial optionality when their legal status changes. Specifically reserved for a future ADR-0007-superseding change:

- Dual-licensing (offer an Enterprise/Commercial license alongside AGPL for orgs that can't accept AGPL terms)
- A maintainer-hosted SaaS tier on bbc.tools with SLAs and paid plans
- Selling the IP or licensing it to an acquirer

None of these are exercised in v1. Any of them requires a new ADR that explicitly supersedes ADR-0007 and updates the CLAUDE.md AGPL principle.

### D5. No US co-founder, no jurisdiction move in v1

The Krieger / Saverin / Glass / Chase pattern is a known anti-pattern. The cleanest path for a visa-constrained maintainer holding OSS IP is the Kumar pattern: passive ownership of the repo as personal IP, no active commercialization, defer entity formation until legal status permits. v1 follows that pattern. Jurisdiction-move options (Estonia, Canada Startup Visa, Singapore) are real but represent a much larger life decision and are out of scope for this ADR.

### D6. Contributions accepted, no CLA, copyleft applies

External contributors retain copyright on their contributions. All contributions are licensed under AGPLv3 by virtue of the project license. No CLA is required because the maintainer is not currently planning to relicense (which would require either CLA-style copyright assignment or a rewrite of contributor code). If commercialization activates later, the maintainer accepts that **only maintainer-authored code** can be relicensed without contributor consent. This is an explicit tradeoff favoring contributor trust over future flexibility.

## Consequences

### Positive

- **Visa-compliant.** Maintainer takes no business income. Passive IP ownership of an OSS repo is generally permissible across most US visa categories. (Maintainer should still verify with an immigration lawyer for their specific case; this ADR is not legal advice.)
- **Commercial path preserved.** AGPL is the proven license for solo/small-team OSS founders who want a future commercial tier (Plausible, Cal.com, Sentry pre-BUSL).
- **Self-host story matches license story.** BBC was already self-host-first per ADR-0004. AGPL formalizes that any redistributor must keep their changes open. Hosted forks would have to open-source their hosting code — the Plausible defense.
- **Faster v1.** No Stripe integration, no paywall logic, no credit-metering instrumentation. Phase K scope shrinks by ~60%.
- **Different audience.** OSS launch (Show HN, r/selfhosted, GitHub trending, Product Hunt OSS category) is well-trodden distribution for solo developer-tooling founders.

### Negative

- **No revenue in v1.** Zero MRR. Maintainer eats infra costs personally (capped via D3). Project sustainability depends on the maintainer's other income / day job / status change.
- **No paid acquisition.** Without revenue there's no acquisition budget. Distribution relies on organic OSS channels.
- **AGPL repels some enterprise contributors and users.** Companies with policies against AGPL won't adopt or contribute. This is a known tradeoff (Plausible, Cal.com accept it).
- **Contributor CLA absence forecloses relicensing across contributor code.** If the maintainer ever wants to dual-license, they can only relicense their own commits without a major contributor-consent process. Documented in D6 as an accepted tradeoff.
- **Hosted demo is a personal expense.** The maintainer is paying Anthropic out of pocket for non-paying users. Caps mitigate but do not eliminate this.

### Governance

- The CLAUDE.md `Non-negotiable principles` list gains a new principle (#7) referencing this ADR.
- Phase K is rewritten in `docs/plans/2026-05-10-bbc-user-facing-product-design.md` §12 — Stripe / paywall / credit metering removed, BYOK + marketplace + self-host template retained.
- Phase J (the open PR #1) is unaffected by this ADR. It ships as-is.
- The `pricing-architecture.md` doc and the v1.0 success metrics are revised to reflect OSS-launch funnel metrics (GitHub stars, forks, hosted-demo activations) instead of MRR / paid conversions.
- The `external_accounts` table (Phase K placeholder per ADR-0005) now stores per-tenant *user-provided* provider keys (Anthropic, OpenAI, etc.), not BBC-managed accounts.

## What this ADR does NOT decide

- Whether to pursue a jurisdiction move (Estonia, Canada Startup Visa, Singapore) in the future. Out of scope; revisit if maintainer's situation changes.
- Whether to add a CLA to enable future relicensing. Deferred until commercialization is concretely on the table.
- Specific commercial license terms or pricing for a future dual-licensed tier. Deferred — Cal.com's EE license is one viable template.
- Whether to add telemetry to count self-host installations (opt-in). Deferred to a Phase L sub-decision.

## References

- Cal.com — [Switching to AGPLv3 + introducing Enterprise Edition](https://cal.com/blog/changing-to-agplv3-and-introducing-enterprise-edition)
- Plausible — [Building an open source SaaS](https://plausible.io/blog/open-source-saas)
- HashiCorp BUSL backlash / OpenTofu fork — [InfoWorld coverage](https://www.infoworld.com/article/2336694/opentofu-may-be-showing-us-the-wrong-way-to-fork.html)
- Manu Kumar (F-1 founder pattern) — [K9 Ventures](https://www.k9ventures.com/blog/2009/09/24/my-story-and-support-for-the-founders-visa/)
- Mike Krieger Instagram visa story — [Alma](https://www.tryalma.com/learn/mike-krieger-immigration-story)
- ADR-0001 (v1 scope), ADR-0004 (two deployment modes), ADR-0005 (multi-source ingestion), ADR-0006 (Marketing Studio architecture)
