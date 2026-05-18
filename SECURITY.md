# Security Policy

BBC is an AGPLv3 open-source project. We take security seriously. Thank you for helping keep BBC and its users safe.

## Reporting a vulnerability

**Please do not file public GitHub issues for security reports.**

Email **security@bbc.tools** with:

- A description of the issue and its potential impact.
- A reproducer (steps, payload, or proof-of-concept) — minimal is fine.
- Your name or handle if you want credit in the disclosure.

You should expect:

- An acknowledgement within **72 hours** (usually faster).
- A coordinated disclosure timeline, typically **90 days**, negotiable based on severity and ease of fix.
- A credit in the release notes (with your consent) when the fix ships.

There is no paid bug bounty in v1.5 — BBC takes no revenue per [ADR-0007](memory/decisions/0007-oss-first-agpl-deferred-commercialization.md). We will still send a thank-you and credit publicly if you'd like.

## In scope

- The dashboard application at `apps/dashboard/` (the Next.js app users sign into).
- The MCP server endpoint exposed by the dashboard.
- The REST shim under `/api/v1/brain/*`.
- The Connector ingest path (Slack/Linear/GitHub ingestion handlers and webhook endpoints).
- The queue gate (`scripts/propose.sh`, `accept.sh`, `reject.sh`, and the DB-mode `propose_change` / `accept_proposal` / `reject_proposal` RPCs).
- The RLS policies on `memory_files`, `studio_runs`, `recommendations`, and related tables.

## Out of scope

- Vulnerabilities in third-party services BBC depends on (Supabase, Cloudflare, the LLM providers). Report those directly upstream — we'll coordinate where it makes sense.
- Self-hosted instances configured insecurely against documented guidance (e.g., disabling RLS, exposing the service-role key to clients). We're happy to clarify guidance; we don't treat operator misconfiguration as a BBC vulnerability.
- Social engineering of maintainers or users.
- Findings that require physical access, a privileged local account, or rooted devices.
- Denial-of-service via raw request volume against the hosted demo — that's a Cloudflare WAF / rate-limit concern (see `docs/security/cloudflare-waf.md`).

## Coordinated disclosure

We follow a **90-day** disclosure window from the first reply, extendable by mutual agreement. Once a fix lands:

1. We publish a [GitHub Security Advisory](https://github.com/ocWWp/bbc/security/advisories) with the CVE (if applicable), affected versions, and the patched release.
2. We credit the reporter in the advisory and the release notes (unless they prefer anonymity).
3. We update `docs/security/THREAT-MODEL.md` if the finding revealed a gap in our model.

## What's automated

- **Semgrep** (`.github/workflows/semgrep.yml`) — OWASP Top 10, secrets, and JS/TS rules on every PR and weekly.
- **OpenSSF Scorecard** (`.github/workflows/scorecard.yml`) — supply-chain health, branch protection, dependency pinning checks.
- **Socket** — GitHub App that flags supply-chain risk on every new dependency.
- **Dependabot** — automatic PRs for vulnerable dependencies.
- **Cloudflare WAF + rate limiting** — see `docs/security/cloudflare-waf.md` for the production zone configuration.

Findings from these scanners are triaged in the same way as direct reports.
