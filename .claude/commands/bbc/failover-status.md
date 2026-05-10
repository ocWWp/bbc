---
name: bbc:failover-status
description: Show heartbeat age, LKG, current role, and last era-promotion (in the active tenant repo)
allowed-tools:
  - Read
  - Bash
---

<objective>
Diagnostic. Prints what the F3 failover protocol thinks is going on inside the **active tenant repo** (`$BBC_REPO` or the tenant that the dashboard is currently configured to read from):
- This host's role (primary / shadow / unknown).
- Heartbeat freshness (when was the last write to `_log/heartbeat`?).
- LKG version pointer.
- Most recent era-promotion entry, if any.
- Configured shadow_host + log_remote.

The BBC product repo itself does NOT have an `_log/` — that lives in tenant repos. If `BBC_REPO` is unset and you're in the BBC product repo, this command may have nothing to read; point at a tenant repo first via `BBC_REPO=path-to-tenant`.
</objective>

<process>
1. Resolve the tenant repo root: `${BBC_REPO:-./examples/example-tenant}` (relative to the BBC product repo). Call it `<tenant>`.
2. Read `<tenant>/_log/heartbeat` — print `v`, `ts`, `host`, and how many seconds old.
3. Read `<tenant>/_log/lkg.txt` — print version.
4. Read `<tenant>/_log/role` if it exists — primary / shadow.
5. Tail `<tenant>/_log/operations.jsonl` and find the most recent `action: era-promotion`. Print v, ts, previous_primary, new primary host.
6. Read `<tenant>/memory/ops/_failover-config.yaml` — print primary_host, shadow_host, log_remote. (Skip if file missing — F3 config is optional.)
7. If shadow_host is empty: print "No shadow configured. F3 is single-host. To activate failover, populate _failover-config.yaml + provision a Shadow."
</process>

<example_output>
```
=== BBC failover-status — tenant: examples/example-tenant ===
Role:           primary (per _log/role)
Heartbeat:      v=8 ts=2026-05-08T10:14:30Z (3s old) host=acme-laptop
LKG:            v=8
Last era-promotion: (none)
Config:
  primary_host: acme-laptop
  shadow_host:  (empty)
  log_remote:   (empty)

No shadow configured. F3 is single-host. To activate failover, populate
_failover-config.yaml + provision a Shadow.
```
</example_output>
