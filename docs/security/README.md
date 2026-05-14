# BBC security docs

What lives here, in dependency order:

- **`THREAT-MODEL.md`** — STRIDE walk of v1.5 surfaces. Read first to understand what we're defending and against whom.
- **`launch-checklist.md`** — operator runbook gating DNS cutover. Every box must be ticked before flipping `bbc.tools` to a public IP.
- **`cloudflare-waf.md`** — edge configuration runbook (WAF managed rules, rate limits, bot protection). Operator copies this into the Cloudflare dashboard.

## What's automated

| Tool | Where | Triggers on |
|---|---|---|
| Semgrep | `.github/workflows/semgrep.yml` | every PR, push to main, weekly |
| OpenSSF Scorecard | `.github/workflows/scorecard.yml` | push to main, weekly, branch-protection changes |
| Socket (GitHub App) | external — install via https://socket.dev/install | every PR that touches `package.json` or `pnpm-lock.yaml` |
| Dependabot | GitHub repo settings | weekly + on CVE publication |
| Cloudflare WAF + rate limiting | external — production zone | every request to `bbc.tools` and subdomains |

Socket and Cloudflare are external accounts the maintainer manages outside this repo. The launch-checklist tracks their state.

## Reporting

`SECURITY.md` at the repo root is the canonical disclosure policy. `apps/dashboard/public/.well-known/security.txt` (served at `https://bbc.tools/.well-known/security.txt`) points at the same address: `security@bbc.tools`.

## Why this layout

These files are operator-facing, not user-facing. They live under `docs/security/` and are not bundled into the deployed app. The threat-model and checklist update as the surface evolves — anything truly load-bearing (rate-limit thresholds, in-scope surfaces) gets cross-referenced from `SECURITY.md` so external reporters see consistent guidance.
