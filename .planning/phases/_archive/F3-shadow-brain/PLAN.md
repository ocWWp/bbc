# F3 — Shadow Brain Failover (DESIGN)

## Context

The original BBC pitch promised "always on." V1 has no failover at any layer: if the host running BBC scripts goes down, every queue operation fails until a human notices. The user's earlier spec sketched a Primary/Shadow architecture with a versioned log, last-known-good (LKG) pointer, and a six-step promotion sequence. F3 formalizes that.

F3's goal is **continuity through bounded automatic failover**, not arbitrary multi-master HA. We have two roles (Primary, Shadow), one tier at a time, and a single source of truth (the versioned log) that both can read. Failover takes seconds-to-minutes, not milliseconds. That tradeoff is explicit.

This phase defines:
1. The versioned log format that makes recovery deterministic.
2. Heartbeat + detection mechanism.
3. The six-step promotion sequence.
4. De-confliction when an old Primary wakes up.
5. What's explicitly NOT solved (split brain, byzantine actors, storage-level corruption).

---

## 1. Roles

- **Primary** — the live BBC. Owns writes. All `propose.sh`, `accept.sh`, `reject.sh`, `bootstrap-leaf.sh` runs go through Primary. Emits heartbeats.
- **Shadow** — replica. Pulls the log from a shared remote (e.g., a git remote, S3, or a dumb file server). Runs no writes during normal ops. Watches Primary's heartbeat. On Primary failure, takes over.

Both roles run on actual hosts (developer laptop + a small VM, two VMs, etc.) — F3 doesn't care about infra topology, only the protocol between them.

---

## 2. The versioned log

Every BBC mutation appends one entry to `bbc/_log/operations.jsonl`. Append-only. Every entry carries a monotonically increasing version, the actor, the action, and a state hash.

```jsonl
{"v": 47, "ts": "2026-05-08T08:07:59Z", "host": "primary-laptop", "actor": "leaf:8azi-web-stub", "action": "propose", "target": "queue/2026-05-08T08-07-59Z__leaf-8azi-web-stub__no-emoji.md", "state_hash": "0x1A...", "lkg_at_emit": 47}
{"v": 48, "ts": "2026-05-08T08:08:30Z", "host": "primary-laptop", "actor": "manager", "action": "review-annotate", "target": "queue/2026-05-08T08-07-59Z__leaf-8azi-web-stub__no-emoji.md", "state_hash": "0x2B...", "lkg_at_emit": 48}
{"v": 49, "ts": "2026-05-08T08:08:39Z", "host": "primary-laptop", "actor": "human:zeth", "action": "accept", "target": "memory/design/voice-tone.md", "state_hash": "0x3C...", "lkg_at_emit": 49}
```

### Fields

| Field | Meaning |
|---|---|
| `v` | Monotonic integer. Always increases. The protocol's source of truth for ordering. |
| `ts` | ISO-8601 UTC. Advisory only — clocks lie; `v` is authoritative. |
| `host` | Which physical host emitted this. Used for de-confliction. |
| `actor` | Who initiated the operation (leaf, manager, human, ranker). |
| `action` | `propose` / `review-annotate` / `accept` / `reject` / `bootstrap-leaf` / `index-regen` / `era-promotion` (special, see §4). |
| `target` | Path that was mutated (relative to BBC root). |
| `state_hash` | SHA-256 of the canonical state of `target` after the operation. Used for validation during recovery. |
| `lkg_at_emit` | The LKG version number known at emit time. Always ≤ `v`. Helps Shadow figure out what was provably good when this operation ran. |

### LKG (Last Known Good) pointer

Stored at `bbc/_log/lkg.txt` — single line, just the version number. Advanced when:

- The operation completes without error.
- Its `state_hash` matches what the file actually contains on disk after the write.
- An optional post-validate hook (e.g., `scripts/index-memory.sh` succeeds, schemas validate) returns 0.

If any of those checks fails, `lkg.txt` does NOT advance. The operation entry stays in the log with `state: WARN` or `ERROR` per the actor's emit, but LKG remains at the previous good state.

### Heartbeat

Primary writes `bbc/_log/heartbeat` once every `HEARTBEAT_SECONDS` (default 30). Content: `{"v": <current_v>, "ts": <now>, "host": <hostname>}`. Atomic write (`mktemp` + `mv`).

Shadow polls heartbeat once every `POLL_SECONDS` (default 10). Tracks the most recent heartbeat it saw. Three consecutive polls without a fresh heartbeat → Primary is presumed dead.

Default failover threshold: 3 missed heartbeats × 30s = **90 seconds maximum delay** before Shadow promotes.

---

## 3. The six-step promotion sequence (verbatim from user's spec, formalized)

When Shadow detects Primary failure (3 missed heartbeats):

### Step 1 — Detection

```
shadow_state.last_heartbeat is older than (now - 3 × HEARTBEAT_SECONDS)
→ promote() begins
```

Shadow logs to its own console: `DETECTED: primary heartbeat stale since ts=<>; LKG=<v>; initiating promotion`.

### Step 2 — Ingestion

Shadow pulls the latest log from the remote source of truth. The remote IS the protocol's authority — both Primary and Shadow have been pushing to it via every operation.

```bash
git -C bbc fetch origin              # if log is git-backed
# or aws s3 sync s3://bbc-log/ bbc/_log/   # if S3
```

Shadow now has the most recent log entries Primary emitted before dying.

### Step 3 — Identification

Shadow reads `bbc/_log/lkg.txt`. This is the version number after which everything is known to be in a valid state. Call it `v_lkg`.

Shadow then reads the log entries with `v > v_lkg`. These are the entries Primary emitted that have NOT yet passed validation. Call them `tail`.

### Step 4 — Validation

For each entry in `tail`:

1. Re-read the actual file at `entry.target` from disk.
2. Compute its current `state_hash`.
3. Compare against `entry.state_hash`.
4. If match: this operation completed and persisted. Mark `entry.outcome = OK`.
5. If mismatch (or file missing): operation didn't persist. Mark `entry.outcome = INCOMPLETE`.

Then walk forward from `v_lkg`:

- The longest prefix of consecutive `OK` entries from `v_lkg + 1` upward becomes the new LKG candidate.
- Stop at the first `INCOMPLETE` or `ERROR`.

If the entire tail is OK: Shadow inherits state at `v = max(tail).v`.
If some tail entries are INCOMPLETE: Shadow rolls back to the last-OK version. Entries beyond that are presumed dead — they never persisted.

### Step 5 — Promotion

Shadow appends a special log entry:

```jsonl
{"v": <next_v>, "ts": "...", "host": "shadow-vm", "actor": "shadow", "action": "era-promotion", "target": "_log/", "state_hash": "<hash of /_log/ state>", "lkg_at_emit": <new lkg>, "previous_primary": "primary-laptop", "tail_outcome": {...}}
```

This entry is the explicit changeover signal. Any host that reads the log after this point sees: "primary-laptop was deposed at v=N; shadow-vm took over."

Shadow now starts emitting heartbeats. It begins accepting writes. From the perspective of the rest of BBC, nothing happened except a brief queue-write outage.

### Step 6 — De-confliction

When the old Primary host wakes up (laptop reopens, VM restarts, network reconnects), it does NOT assume Primary status. It first reads the log:

```
old_primary_last_v = read own last emitted v (from local journal)
remote_log_max_v = max v in remote log

if remote_log_max_v > old_primary_last_v:
  → look for an era-promotion entry between old_primary_last_v and remote_log_max_v
  → if found AND its previous_primary == self.host:
       demote to Shadow role; sync state; resume heartbeat-watching
  → if found but previous_primary != self.host:
       hard error — log corruption or split brain (see §5)
  → if no era-promotion: Primary just lost its connection briefly; resume heartbeat emission carefully (read locks first)
```

**Critical:** old Primary never writes to the log between detecting it's behind and successfully demoting. Any write would be a split-brain attempt.

---

## 4. Concrete log walkthrough (matching user's earlier sketch)

```
[v47 | OK    | hash:0x1A | "Normal ops"               | LKG: v47 | host: primary-laptop]
[v48 | OK    | hash:0x2B | "Manager validated"        | LKG: v48 | host: primary-laptop]
[v49 | OK    | hash:0x3C | "Main coordinated task"    | LKG: v49 | host: primary-laptop] ← LAST KNOWN GOOD
[v50 | WARN  | hash:0x4D | "Latency spike detected"   | LKG: v49 | host: primary-laptop]
[v51 | ERROR | hash:0x5E | "Invalid output format"    | LKG: v49 | host: primary-laptop]
[v52 | ERROR | hash:0x6F | "CRASH / DISCONNECT"       | LKG: v49 | host: primary-laptop]

← Primary stops emitting heartbeats here.
← 90 seconds pass. Shadow detects.

Shadow ingests, identifies LKG=v49.
Shadow validates tail (v50, v51, v52).
v50: WARN but state hash matches → OK as far as state goes; advisory only.
v51: ERROR; state hash MISMATCH → INCOMPLETE. Roll back this op.
v52: ERROR; "CRASH" with no state_hash recorded → INCOMPLETE.

Shadow's new effective LKG: v50 (the last successfully-persisted op).
v51 and v52 are dead. Their target paths are restored to v50 state.

Shadow emits:
[v53 | OK    | hash:0xNEW | "era-promotion"            | LKG: v50 | host: shadow-vm | previous_primary: primary-laptop]

Shadow is now Primary. Heartbeats resume from shadow-vm.

Old primary-laptop wakes up at, say, 30 minutes later.
Reads remote log. Sees v53 era-promotion. Sees previous_primary == self.
Demotes itself: starts Shadow role, watches shadow-vm's heartbeat.
```

---

## 5. What F3 explicitly does NOT solve

These are real problems. F3 is bounded.

1. **Network partition / split brain.** If Primary and Shadow can both write to the remote log but can't see each other (NAT, firewall, partition), both might think they're Primary. F3 mitigates by:
   - Single remote = single source of truth (both must write to the same place).
   - The era-promotion entry is unique — if two appear with overlapping versions, the lexicographically-first `host` wins, and the loser hard-errors.
   - If the remote itself partitions (one node sees one log, the other a different log), nothing in F3 prevents divergence. **No fix without consensus protocol.** Out of scope.
2. **Byzantine actors.** A malicious Primary that emits crafted log entries to fool Shadow into rolling back valid state. F3 trusts the log writers. **No fix.** Use access control on the remote, audit log integrity periodically.
3. **Storage corruption.** Bit rot in the log file itself, beyond what state_hash catches. **No fix.** Periodic snapshots + integrity checks (rsync verify, S3 MD5) are the operator's job.
4. **Multiple Shadows.** F3 is one-Primary-one-Shadow. Multi-replica failover (3+ nodes, voting) is a different protocol (Raft/Paxos). Out of scope.
5. **Cross-region failover with high latency.** The 90-second default failover assumes Shadow can pull the log within tens of seconds. Across continents this is borderline; F3 doesn't tune for it. Operator can adjust HEARTBEAT_SECONDS / POLL_SECONDS.
6. **Operator error during de-confliction.** A human running `accept.sh` on the old Primary while it's offline (and the log is stale) creates a divergent local state that F3 detects but cannot recover from automatically — the operator must reconcile. The script SHOULD refuse to run without a fresh log pull, but enforcement is operator discipline.
7. **Atomic multi-file operations.** `accept.sh` modifies the target file, the proposal, and the index in three steps. If Primary crashes between step 1 and step 3, the log will show a single "accept" entry but the actual state is partial. The state_hash check during validation catches this, but recovery requires either redoing or rolling back ALL three steps. F3 specifies the detection; the recovery action policy is left to F3-build-3.

---

## 6. Configuration

```yaml
# memory/ops/_failover-config.yaml (org-wide, Main-owned)
---
id: failover_config
type: failover-config
scope: org
layer: main
owning_layer: main
status: accepted
---

heartbeat_seconds: 30
poll_seconds: 10
failover_threshold_misses: 3
log_remote: "git@github.com:8azi/bbc-log.git"   # or s3://, or rsync://
log_local_path: "bbc/_log/"
era_promotion_requires_lkg_advance: true        # don't promote on a stale LKG
de_confliction_requires_remote_pull: true       # old primary must fetch before acting
```

These are tunable. Default heartbeat 30s + poll 10s + 3 misses = ~90s worst-case unavailability. Tune up for noisy networks, tune down for low-latency same-region replicas.

---

## 7. Files this phase WILL produce when implemented

```
bbc/_log/
├── operations.jsonl                  # append-only versioned log
├── heartbeat                         # last-write timestamp from Primary
└── lkg.txt                           # LKG version pointer

memory/ops/
└── _failover-config.yaml

scripts/
├── log-emit.sh                       # called by every mutating script; emits a log entry + advances LKG
├── heartbeat-emit.sh                 # daemon: writes heartbeat every HEARTBEAT_SECONDS
├── shadow-watch.sh                   # daemon: polls heartbeat; on threshold, calls promote.sh
├── promote.sh                        # the 6-step promotion sequence
├── deconflict.sh                     # called on old Primary wake; either demotes or hard-errors
└── log-validate.sh                   # one-shot: walk log, check hashes, advance LKG to longest-prefix-OK

manager/agents/
└── log-auditor.md                    # weekly Manager sweep: scan log for ERRORs, flag patterns

.claude/commands/bbc/
├── failover-status.md                # /bbc:failover-status — heartbeat age, LKG, my role
└── promote.md                        # /bbc:promote — manual failover trigger (rare)

memory/decisions/
└── 0003-failover-protocol-adopted.md # ADR locking in the protocol
```

---

## 8. Build phases (each its own future plan)

- **F3-build-1 (log infrastructure):** `log-emit.sh` + every mutating script wired to call it. `lkg.txt` advances on success. Validate with `log-validate.sh` walking historical operations.
- **F3-build-2 (heartbeat):** Primary emits, Shadow watches. No promotion yet — just verify heartbeat-misses are detected and reported.
- **F3-build-3 (promotion):** `promote.sh` implementing all six steps. Tested against synthetic failures (kill Primary, observe Shadow take over). Recovery policy for partial multi-file operations specified here.
- **F3-build-4 (de-confliction):** Old Primary returns; verifies it correctly demotes. Test partition scenarios as far as F3's bounded scope allows.
- **F3-build-5 (UX):** `/bbc:failover-status` slash command, manager `log-auditor` agent for weekly health, `/bbc:promote` manual trigger for graceful planned failovers.

---

## 9. Acceptance for this DESIGN phase

- This PLAN.md exists.
- §3 documents the six-step sequence verbatim from user's earlier spec, with concrete validation rules.
- §4 walks the user's exact log example through the protocol.
- §5 explicitly bounds what F3 cannot solve (six items, each with mitigation or "no fix").
- Roadmap and STATE updated.
