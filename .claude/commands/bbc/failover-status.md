---
name: bbc:failover-status
description: Show heartbeat age, LKG, current role, and last era-promotion
allowed-tools:
  - Read
  - Bash
---

<objective>
Diagnostic. Prints what the F3 protocol thinks is going on:
- This host's role (primary / shadow / unknown).
- Heartbeat freshness (when was the last write to `_log/heartbeat`?).
- LKG version pointer.
- Most recent era-promotion entry, if any.
- Configured shadow_host + log_remote.
</objective>

<process>
1. Read `bbc/_log/heartbeat` — print `v`, `ts`, `host`, and how many seconds old.
2. Read `bbc/_log/lkg.txt` — print version.
3. Read `bbc/_log/role` if it exists — primary / shadow.
4. Tail `bbc/_log/operations.jsonl` and find the most recent `action: era-promotion`. Print v, ts, previous_primary, new primary host.
5. Read `bbc/memory/ops/_failover-config.yaml` — print primary_host, shadow_host, log_remote.
6. If shadow_host is empty: print "No shadow configured. F3 is single-host. To activate failover, populate _failover-config.yaml + provision a Shadow."
</process>

<example_output>
```
=== BBC failover-status ===
Role:           primary (per _log/role)
Heartbeat:      v=8 ts=2026-05-08T10:14:30Z (3s old) host=Zeths-MacBook-Air
LKG:            v=8
Last era-promotion: (none)
Config:
  primary_host: Zeths-MacBook-Air
  shadow_host:  (empty)
  log_remote:   (empty)

No shadow configured. F3 is single-host. To activate failover, populate
_failover-config.yaml + provision a Shadow.
```
</example_output>
