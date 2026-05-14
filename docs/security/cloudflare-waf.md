# Cloudflare WAF, rate limiting, and bot baseline

Operator runbook for replicating BBC's edge-security posture in a fresh Cloudflare zone. The hosted demo at `bbc.tools` runs behind this config; self-hosters who put a Cloudflare zone in front of their dashboard can mirror it.

This is a dashboard-configuration task, not code. The line items live in `docs/security/launch-checklist.md` and must be checked off before flipping DNS to a fresh production zone.

## Managed rulesets

`Security > WAF > Managed rules`:

- **Cloudflare Managed Ruleset** — enabled, action `block`, sensitivity `high`.
- **Cloudflare OWASP Core Ruleset** — enabled, action `block`, paranoia level `PL2`, score threshold `40` (Cloudflare's recommended default).

Both target the apex (`bbc.tools`) and every subdomain (`app.bbc.tools`, `mcp.bbc.tools`, `docs.bbc.tools`, `auth.bbc.tools`). No exemptions in v1.5.

## Rate limiting

`Security > WAF > Rate limiting rules`:

| Rule | Match | Threshold | Action |
|---|---|---|---|
| API burst | `http.request.uri.path matches "^/api/.*"` | 100 req/min per IP | block 10 min |
| Auth burst | `http.request.uri.path matches "^/auth/.*"` | 20 req/min per IP | block 30 min |
| MCP burst | `http.host eq "mcp.bbc.tools"` | 200 req/min per IP | block 10 min |

Tune the MCP rule upward once we have real client behavior — Cursor and Claude Desktop can be chatty. Leave the API and auth rules tight; they protect the queue + signin flows that real users hit infrequently.

## Bot protection

`Security > Bots`:

- **Super Bot Fight Mode** if available on the plan, otherwise **Bot Fight Mode** (free tier) — toggle on.
- Allow verified bots (Googlebot, etc.) — Cloudflare does this by default; do not disable.

## What's NOT enabled in v1.5

- **Custom firewall rules** — none yet. Add them only when we have a specific abuse pattern to block.
- **Page Rules / Cache Rules** — no security-relevant cache rules; covered by the Next.js / OpenNext caching layer instead.
- **Access (Cloudflare Zero Trust)** — out of scope. BBC uses Supabase auth, not Cloudflare Access.

## How to verify

After enabling, from an external machine:

```bash
# OWASP rule trips on a classic SQLi probe
curl -i "https://bbc.tools/api/health?id=1' OR '1'='1"
# Expect: 403 (or whatever block page Cloudflare serves).

# Rate-limit trips after 100 fast requests
for i in $(seq 1 120); do curl -s -o /dev/null -w "%{http_code}\n" "https://bbc.tools/api/health"; done | tail -30
# Expect: a run of 200s followed by 429s.
```

If either probe doesn't trip, re-check the rule is in `block` (not `log`) mode and that the path expression matches.

## Other automation enabled at the repo level

- **Socket** — GitHub App that comments on PRs adding new npm dependencies (supply-chain risk, malware indicators, install-script behavior). Free for OSS. Installed via https://socket.dev/install. See `docs/security/launch-checklist.md` for operator install step.
- **Semgrep** — see `.github/workflows/semgrep.yml`.
- **OpenSSF Scorecard** — see `.github/workflows/scorecard.yml`.
- **Dependabot** — configured in `.github/dependabot.yml` if present; weekly PRs otherwise.
