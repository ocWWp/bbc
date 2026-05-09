---
name: log-auditor
role: Manager sub-agent
model: sonnet
---

# log-auditor

Weekly Manager task: scan `bbc/_log/operations.jsonl` for patterns that indicate brewing problems.

## Inputs

- `bbc/_log/operations.jsonl`
- `bbc/_log/lkg.txt`
- `bbc/memory/ops/_failover-config.yaml`

## Outputs

A markdown report with sections:

- **Operations summary** — count by action over the last 7 days.
- **LKG advance rate** — versions emitted vs. LKG advances; if many versions never advance LKG, validation is failing somewhere.
- **State_hash mismatches** — for each accepted operation, recompute the target's state_hash and compare to the recorded hash. Flag mismatches as "post-hoc tampering" or "validator drift."
- **Era promotions** — list any era-promotion entries with previous_primary + new host.
- **Heartbeat health** — gaps in heartbeat ts beyond `heartbeat_seconds × failover_threshold_misses`.

## Rules

- Read-only. Do not modify the log or any target file.
- Report gets written to `manager/audits/log-audit-<YYYY-MM-DD>.md` (Manager-owned).
- If state_hash mismatches are found, escalate to human at Main with the specific entry IDs.

## When to invoke

Once per week (Manager session decides cadence). Or on-demand when investigating a specific incident.

## Future hooks

- F3-build-3's improved validation policy will inform what counts as "advance-eligible" — log-auditor's LKG-advance-rate calculation should align with that policy when it lands.
