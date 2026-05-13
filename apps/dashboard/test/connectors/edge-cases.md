# Connector edge-case matrix

Live-staging acceptance checklist for D-W6-2. Every scenario below names the
connector under test, the steps to trigger the edge case, the expected
runSync() / route behavior, and a slot for the run result.

Each row's **Status** is one of:
- `pass` — observed behavior matched expected.
- `fail` — observed behavior diverged; **Fix commit** SHA references the patch.
- `known limitation` — diverges but acceptable for v1.5; **Tracked** links to
  the carry-over ticket.

The matrix targets the runtime guarantees the framework documents in
`apps/dashboard/src/lib/connectors/framework.ts` (token refresh < 24h,
yield-based 429 backoff, cursor persistence, partial-failure commit,
source_ref dedup, max_proposals_per_sync cap).

## Prereqs

- Staging Supabase project with all v1.5 migrations applied.
- Live OAuth dev creds for: Notion, Linear, Google (Gmail + Drive), GitHub.
  - `BBC_NOTION_CLIENT_ID/SECRET`
  - `BBC_LINEAR_CLIENT_ID/SECRET`
  - `BBC_GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI`
  - `BBC_GITHUB_APP_ID/PRIVATE_KEY` (or the OAuth equivalent)
- `BBC_SECRET_ENCRYPTION_KEY` set; `BBC_HOSTED_DEMO_MODE=false`.
- One staging tenant (`edge-case-runner`) with admin role on the test user.

## Setup snapshot

| | Provider | Account state |
|---|---|---|
| 1 | Notion | Free workspace with 3 pages: 1 valid `decision`, 1 valid `glossary`, 1 with malformed block (see §3) |
| 2 | Linear | Personal workspace, 5 issues across 2 projects |
| 3 | Gmail | Test inbox seeded with 10 threads, 1 starred, 2 with custom label `decision-pinned` |
| 4 | Drive | Folder with Doc, Sheet, Slide, PDF, oversized binary (>10MB) |
| 5 | GitHub | Public repo with 2 SKILL.md files; second one will be deleted mid-test |

---

## §1 — Token refresh < 24h before expiry

Framework guarantee: `runSync` calls `connector.refresh_token(external_account_id)` when `expires_at - now < TOKEN_REFRESH_WINDOW_MS` (24h).

### 1.1 — Refresh path: Gmail

| | |
|---|---|
| **Steps** | Install Gmail; in Supabase, UPDATE `external_accounts.expires_at = now() + interval '6 hours'` for the row. Trigger a manual sync. |
| **Expected** | `external_accounts.access_token` ciphertext changes (compare hash before/after); `expires_at` rolls forward; `tenant_connectors.last_sync_status = 'ok'`; new proposals emitted. |
| **Status** | TBD |
| **Notes** | |

### 1.2 — Refresh path: Drive

| | |
|---|---|
| **Steps** | Same as 1.1, against the Drive connector row (shared Google OAuth helper). |
| **Expected** | Same as 1.1. Critically, the refresh helper shared with Gmail must not throw `400` due to over-eager scope checks. |
| **Status** | TBD |
| **Notes** | |

### 1.3 — Refresh path: Linear

| | |
|---|---|
| **Steps** | Same as 1.1, against the Linear connector. |
| **Expected** | Same as 1.1. Linear tokens are 90-day, so the 6h offset must trigger refresh. |
| **Status** | TBD |
| **Notes** | |

### 1.4 — Refresh path: Notion (no-op)

| | |
|---|---|
| **Steps** | Install Notion; verify no `refresh_token` implementation on the connector. Run a sync. |
| **Expected** | Sync proceeds without calling refresh_token (Notion v2 tokens are non-expiring). No errors. |
| **Status** | TBD |
| **Notes** | |

### 1.5 — Auth-expired surfaces correctly

| | |
|---|---|
| **Steps** | Revoke the OAuth grant in the provider's UI; trigger a sync. |
| **Expected** | `last_sync_status = 'auth_expired'`; `last_sync_error` set; Library card surfaces "Reconnect" CTA; no proposals committed. |
| **Status** | TBD |
| **Notes** | |

---

## §2 — 429 backoff (yield-based, not throw)

Framework guarantee: yielding `{kind: "rate_limit", retry_after_ms}` causes runSync to sleep with exponential delay + 50–150% jitter, then resume iteration. Throwing inside the generator must NOT exhaust it.

### 2.1 — Gmail: 429 with Retry-After header

| | |
|---|---|
| **Steps** | Lower max_proposals to a small number to extend the walk; ratelimit Gmail by spamming threads.list. |
| **Expected** | Generator yields `rate_limit`; runSync sleeps; iteration resumes; sync completes `ok` or `partial`; no `error` status. |
| **Status** | TBD |
| **Notes** | |

### 2.2 — Notion: 429 backoff exhaustion

| | |
|---|---|
| **Steps** | Cap rate_limit_strategy.max_retries at 2; intentionally trigger >2 sequential 429s. |
| **Expected** | runSync persists `last_sync_status = 'rate_limited'`; last cursor preserved in `sync_state.cursor`; on next manual trigger, resumes from that cursor. |
| **Status** | TBD |
| **Notes** | |

---

## §3 — Malformed Notion blocks

### 3.1 — Page with unsupported block type

| | |
|---|---|
| **Steps** | In Notion, add a page that contains a synced_block, embed, or other block type the renderer doesn't recognize. Sync. |
| **Expected** | The proposal commits; unsupported blocks render as placeholder text (e.g., `[unsupported block: synced_block]`), not as a thrown error that kills the page-level proposal. |
| **Status** | TBD |
| **Notes** | |

### 3.2 — Page with type property = unknown supertag

| | |
|---|---|
| **Steps** | Notion page with `type: foo` (not in the 9-supertag enum). Sync. |
| **Expected** | Proposal commits as `type: 'note'` (the documented fallback). No rejection, no error. |
| **Status** | TBD |
| **Notes** | |

### 3.3 — Page with empty body

| | |
|---|---|
| **Steps** | Notion page with title only, no blocks. Sync. |
| **Expected** | Proposal commits with `body: ''`. No crash on the renderer. |
| **Status** | TBD |
| **Notes** | |

---

## §4 — Oversized Drive doc

### 4.1 — Doc > export limit

| | |
|---|---|
| **Steps** | Place a Google Doc > 10 MB exported text into the target folder. Sync. |
| **Expected** | The proposal commits with `type: 'source_artifact'` (not `decision`/`note`), truncated body, and `fields.size_bytes` recorded. Sync does not fail. |
| **Status** | TBD |
| **Notes** | |

### 4.2 — Sheet exported to text/csv

| | |
|---|---|
| **Steps** | Sync a folder containing a Google Sheet. |
| **Expected** | Export request uses `text/csv` (NOT `text/plain` — the documented codex [P2] fix). No 400 from Drive API. |
| **Status** | TBD |
| **Notes** | |

### 4.3 — Binary PDF

| | |
|---|---|
| **Steps** | Sync a PDF. |
| **Expected** | `type: 'source_artifact'`; binary contents not embedded; `fields.mime`, `fields.size_bytes`, `fields.drive_url` set. |
| **Status** | TBD |
| **Notes** | |

### 4.4 — `files.export` does NOT carry supportsAllDrives

| | |
|---|---|
| **Steps** | Inspect outbound request headers/query during a sync (browser devtools or staging logs). |
| **Expected** | The `supportsAllDrives` param appears on `files.list` calls but NOT on `files.export` (codex [P1] fix from W5). 400 would indicate regression. |
| **Status** | TBD |
| **Notes** | |

---

## §5 — Missing Gmail scopes

### 5.1 — OAuth grant excludes gmail.metadata

| | |
|---|---|
| **Steps** | Modify the consent screen flow to skip a scope (or revoke + re-grant with reduced scope). Sync. |
| **Expected** | Sync fails with `last_sync_status = 'auth_expired'`, NOT `'error'` — the partial-grant signal needs to route through re-auth. |
| **Status** | TBD |
| **Notes** | Confirm error mapping in gmail.ts `decodeGmailError()`. |

### 5.2 — Custom label resolution

| | |
|---|---|
| **Steps** | Configure connector with `decision_label: "Decision-Pinned"`. Sync. |
| **Expected** | `users.labels.list` is called once; the opaque label ID is resolved; messages carrying that label → `decision` supertag. Codex [P2] verified. |
| **Status** | TBD |
| **Notes** | |

---

## §6 — Deleted GitHub repo

### 6.1 — Repo deleted between sync and re-sync

| | |
|---|---|
| **Steps** | Install GitHub connector pointing at a public repo. Sync once. Delete the repo from GitHub. Trigger a re-sync. |
| **Expected** | runSync returns `status: 'error'`, `error: 'repo_not_found'` (or equivalent typed message); cursor unchanged; Library card surfaces the error reason. |
| **Status** | TBD |
| **Notes** | |

### 6.2 — File deleted from repo mid-sync

| | |
|---|---|
| **Steps** | Sync a repo with 5 SKILL.md files; delete file #3 before sync completes (race window). |
| **Expected** | The 2 files committed before the delete stay; the 2 files after resume on next sync; no duplicate commits via source_ref dedup. |
| **Status** | TBD |
| **Notes** | |

---

## §7 — Webhook secret rotation

### 7.1 — Old signature rejected after rotation

| | |
|---|---|
| **Steps** | Install a connector with webhooks; capture the current webhook secret from `tenant_connectors.webhook_secret_ciphertext`. Rotate via `/library/<connector>` UI. Replay a captured event signed with the old secret. |
| **Expected** | Webhook handler returns 401; the event lands in `webhook_dead_letters` with `reason: 'signature_mismatch'`; the new signature works on retry. |
| **Status** | TBD |
| **Notes** | |

### 7.2 — DLQ visible at /library/diagnostics

| | |
|---|---|
| **Steps** | After §7.1, open `/library/diagnostics` as an admin. |
| **Expected** | The `signature_mismatch` reason appears in the DLQ table with the correct count. Page paginates if rows > 1000 (codex [P2] fix from W6-4). |
| **Status** | TBD |
| **Notes** | |

---

## Sign-off

When every row is `pass` or `known limitation`:

| | |
|---|---|
| **Run date** | TBD |
| **Tester** | TBD |
| **Branch / SHA** | TBD |
| **Decision** | ship / hold |

If `hold`, list the rows that block launch and the carry-over tickets.
