# F3-build-2..5 — Failover Scaffolding (SUMMARY)

## Status

**Scaffolded (2026-05-08).** All four scripts + two slash commands + one Manager agent + config file shipped. All testable in unit form on a single host. **Real failover requires a Shadow VM** which doesn't exist yet — the system runs single-host until that's provisioned.

## Files

```
memory/ops/_failover-config.yaml       # heartbeat / poll / threshold / shadow_host (empty for V1)

scripts/
├── heartbeat-emit.sh                    # Primary daemon (one-shot or --loop)
├── shadow-watch.sh                      # Shadow daemon — refuses unless shadow_host set
├── promote.sh                           # six-step promotion sequence
└── deconflict.sh                        # old-Primary recovery on wake

bbc/.claude/commands/bbc/
├── failover-status.md                   # /bbc:failover-status
└── promote.md                           # /bbc:promote (Main only, manual trigger)

manager/agents/
└── log-auditor.md                       # weekly Manager sweep
```

## Verified (single-host)

- `heartbeat-emit.sh` — one-shot run produces `_log/heartbeat` with valid `{v, ts, host}` JSON.
- `deconflict.sh` — cold-start case: no era-promotion in log, correctly identifies "resuming as Primary."
- `shadow-watch.sh` — refuses to run because `shadow_host` is empty in `_failover-config.yaml` (correct for single-host mode).
- `promote.sh` — usable as a manual trigger; on a real failover, would walk steps 1–5.

## Activation steps (when Shadow exists)

1. Provision a Shadow host with read access to `log_remote` (git remote / S3 / rsync).
2. Update `memory/ops/_failover-config.yaml`:
   - `log_remote: <URL>`
   - `shadow_host: <hostname>`
3. On Primary: start `bash scripts/heartbeat-emit.sh --loop` via systemd / pm2.
4. On Shadow: start `bash scripts/shadow-watch.sh --loop` via systemd / pm2.
5. To verify: `kill -STOP` the heartbeat daemon on Primary, wait 90s, observe Shadow takes over.

## Known limitations (carried forward; honest)

These match F3 PLAN.md §5's bounded-scope statement. They are not regressions; they are deliberate.

1. **Single-host today.** No Shadow exists, so failover is testable only in unit form. The promote-sequence walking and de-confliction logic ARE testable now (the scripts handle single-host gracefully) but the closed-loop "kill Primary → Shadow takes over" can't run until infra is provisioned.
2. **Network partition / split brain.** Two hosts both able to write to remote = no defense without consensus protocol. Out of scope.
3. **Atomic multi-file operations.** `accept.sh` modifies target + proposal + index in three steps; `promote.sh`'s validate phase only verifies one target hash per log entry. Recovery from a partial accept needs better tracking; sketched but not implemented.
4. **Daemon management is operator territory.** Scripts are ready; the user runs them via systemd / pm2 / cron, not by BBC.
5. **`log-auditor` agent is defined but never auto-invoked.** Manager session can spawn it manually for now. Cron / scheduled invocation is a future operator task.

## Schema gaps surfaced

1. **`promote.sh` step 4's validation logic is heuristic.** It tries state_hash match first, then falls back to "if action is propose/reject and target exists, OK." A more robust V1.x would have per-action validation rules in a separate file.
2. **No log compaction.** `operations.jsonl` grows forever. Will need a "snapshot + truncate" policy for long-running BBCs.
3. **`hostname -s` may not be stable across reboots/relocations.** Production should use a config-driven host identity (`--host` flag or env var).
4. **The `_log/role` marker file** (set by `deconflict.sh`) is the only persistent indicator of which mode this host is in. Subtle: nothing else reads it yet. `failover-status.md` does, but daemon scripts don't gate on it.

## Next

M1 — migrate `8azi-web` as the first real Distribution leaf. With all F-build phases shipped (some skeletal, some fully functional), it's now time to prove the system against a real repo.
