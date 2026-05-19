# Launch security checklist

Operator runbook. Tick each box before flipping DNS for `bbc.tools` (or any fresh production zone) to a public IP.

These items are external-account configuration the maintainer does outside the repo. They do **not** block repo-local work; they block **DNS cutover**.

## Edge (Cloudflare)

- [ ] WAF managed rules enabled (Cloudflare Managed Ruleset + OWASP Core Ruleset), action `block`. See `cloudflare-waf.md`.
- [ ] Rate-limit rules added for `/api/*`, `/auth/*`, and `mcp.bbc.tools`. See `cloudflare-waf.md`.
- [ ] Bot Fight Mode (or Super Bot Fight Mode) toggled on.
- [ ] Verified the OWASP rule trips on the SQLi probe and the rate-limit trips on the 120-request loop. See `cloudflare-waf.md#how-to-verify`.

## Repo (GitHub)

- [ ] **Socket** GitHub App installed on the BBC repo. Visit https://socket.dev/install, grant access to `ocWWp/bbc`. Confirm a comment appears on the next PR that adds an npm dependency.
- [ ] Semgrep workflow green on `main` after the first run. See `.github/workflows/semgrep.yml`.
- [ ] OpenSSF Scorecard workflow green on `main` after the first run; check https://securityscorecards.dev/viewer/?uri=github.com/ocWWp/bbc for a non-zero score.
- [ ] Dependabot enabled in repo settings (Security > Code security and analysis).
- [ ] Branch protection on `main`: require PR review, require status checks (Semgrep + tests + type-check), require linear history.

## Dependencies

- [x] `pnpm audit --audit-level=high` — 0 findings (sweep 2026-05-13).
- [ ] Re-run `pnpm audit --audit-level=high` immediately before each release; ship only when 0 high+critical.
- [ ] One known moderate as of 2026-05-13: `postcss<8.5.10` transitive via `next` (XSS in CSS stringifier — not on a user-controlled path in this app). Upstream fix lands when Next bumps its bundled postcss; track via Dependabot.

## Secrets

- [ ] `SEMGREP_APP_TOKEN` configured as a GitHub Actions secret (or the workflow runs the offline rule set — see workflow file for the alternate `--config` flags).
- [ ] No long-lived service-role keys or provider keys committed to the repo. `git log -p` audit done for likely names (`SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, etc.).

## Disclosure

- [ ] `security@bbc.tools` mailbox exists and forwards to a real human inbox the maintainer reads daily.
- [ ] `/.well-known/security.txt` resolves over HTTPS on the production domain. The file is at `apps/dashboard/public/.well-known/security.txt`, which Next.js serves at the root URL. After first deploy, `curl -i https://bbc.tools/.well-known/security.txt` should return 200 with the policy.
