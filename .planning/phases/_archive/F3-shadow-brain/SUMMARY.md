# F3 — Shadow Brain Failover (SUMMARY)

## Status

**Designed (2026-05-08).** Pure design phase. No implementation.

## Core decision: bounded automatic failover, not multi-master HA

One Primary + one Shadow, one tier. Both push every mutation to a single remote log (git/S3/rsync). Shadow watches Primary's heartbeat. On 3 missed heartbeats (default 90s), Shadow runs the 6-step promotion sequence:

1. **Detection** — heartbeat staleness threshold tripped.
2. **Ingestion** — pull latest log from remote.
3. **Identification** — locate LKG (last-known-good) version pointer.
4. **Validation** — replay log entries past LKG; verify state hashes against disk; mark each OK / INCOMPLETE.
5. **Promotion** — append `era-promotion` log entry naming previous_primary; start emitting heartbeat; accept writes.
6. **De-confliction** — when old Primary wakes, it sees the era-promotion in the remote log and demotes itself to Shadow role.

## The versioned log

Every BBC mutation (`propose.sh`, `accept.sh`, etc.) appends a JSONL entry with: `v` (monotonic int), `ts`, `host`, `actor`, `action`, `target`, `state_hash` (SHA-256 of resulting state), `lkg_at_emit`. `lkg.txt` advances only when an entry's `state_hash` matches disk AND optional post-validate hooks succeed.

Worked example using user's earlier sketch (v47–v53) is in `PLAN.md` §4.

## What's NOT in F3

Six explicit non-solutions: split-brain across remote partitions (no consensus protocol — out), byzantine actors, storage corruption beyond hash check, multi-replica voting (Raft/Paxos), cross-continent latency tuning, operator running scripts on offline Primary. Each documented in §5 with either a mitigation or an honest "no fix."

## Build phases (deferred)

F3-build-1 (log infrastructure + every script wired), F3-build-2 (heartbeat detection only, no promotion), F3-build-3 (full promotion + partial-multi-file recovery policy), F3-build-4 (de-confliction), F3-build-5 (slash commands + log-auditor agent + manual `/bbc:promote`).

## Source

User's earlier specification of "The Promotion Sequence: A Walkthrough" plus the v47–v53 log example. Full design: `PLAN.md`.
