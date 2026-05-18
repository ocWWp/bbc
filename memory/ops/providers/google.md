---
id: mem_2026-05-17_ops-providers-google
type: fact
scope: org
layer: main
source: human:zeth
created: 2026-05-17T00:00:00Z
updated: 2026-05-17T00:00:00Z
owning_layer: main
tags: [ops, providers, oauth, google, gmail, drive, phase-k]
status: accepted
---

# Google OAuth — operational notes for self-hosters

This is the operator-facing doc for the Google OAuth app powering the Gmail
and Drive connectors. Vendor role registry: see [`memory/ops/vendors.md`](../vendors.md);
this file specializes that registry with the limits and gotchas that bite
when you run BBC's Google connectors yourself.

## What you need before Gmail/Drive can install

A Google Cloud project with an **OAuth client (Web)** plus the
**Gmail API** and **Drive API** enabled. The dashboard reads four env vars
at runtime — see [`apps/dashboard/CLAUDE.md`](../../../apps/dashboard/CLAUDE.md)
for the full env-var table:

- `BBC_GOOGLE_OAUTH_CLIENT_ID`
- `BBC_GOOGLE_OAUTH_CLIENT_SECRET`
- `BBC_PUBLIC_URL` (used to build `${BBC_PUBLIC_URL}/api/oauth/google/callback`)
- `BBC_GOOGLE_OAUTH_VERIFIED` (set to `true` only after Google verification clears)

The redirect URI you whitelist in the Google Cloud console **must** match
the value above exactly, including scheme and trailing path.

## Scopes BBC requests

Defined in [`apps/dashboard/src/lib/connectors/google-oauth.ts`](../../../apps/dashboard/src/lib/connectors/google-oauth.ts):

- **gmail connector** — `gmail.readonly`
- **drive connector** — `drive.readonly` + `drive.metadata.readonly` (both
  required; metadata-only is not enough, see codex P2 on PR #24)

The callback enforces exact-scope grant: if a user unchecks a scope on
the consent screen, the corresponding connector is **not** installed —
the row would otherwise look installed but 403 on every sync.

## The 100-user limit on unverified apps

A Google OAuth client in **Testing** mode can only authorize identities
listed under "Test users" on the OAuth consent screen — **hard cap of 100
test users**, set by Google, not configurable. Anyone outside that list
sees `Error 403: access_denied` with no way to continue. This is the
limit that forces every self-host that wants more than ~a few admins to
either:

1. Stay in Testing mode and curate the 100 most important Gmail/Drive
   users.
2. Submit for verification (review takes weeks; some scopes require an
   annual third-party security audit; `drive.readonly` is a "restricted"
   scope that triggers that audit).

The dashboard's "beta · this app isn't verified" warning (Phase K T19,
`unverified_oauth` field on the catalog) is the user-facing surface of
this fact. Setting `BBC_GOOGLE_OAUTH_VERIFIED=true` removes the warning
once you've cleared review.

## Why we don't pin a single Google Cloud project as canonical

BBC ships AGPLv3 (see [ADR-0007](../../decisions/0007-agplv3-and-byok.md)
and the OSS-first principle in main `CLAUDE.md`). Every self-host runs
its own Google Cloud project + OAuth client; there's no central BBC
Google app forwarding tenants. Without this, BBC couldn't honestly call
itself BYOK for Google data — and any future revocation of a hypothetical
shared app would brick every install at once.

## See also

- [`memory/ops/vendors.md`](../vendors.md) — vendor-role registry
- [`apps/dashboard/CLAUDE.md`](../../../apps/dashboard/CLAUDE.md) — env-var table
- [`docs/plans/2026-05-17-phase-k-install-flow-design.md`](../../../docs/plans/2026-05-17-phase-k-install-flow-design.md) — design context
