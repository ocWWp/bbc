# F3-build-1 — Log Emission (SUMMARY)

## Status

**Complete (2026-05-08).** `scripts/log-emit.sh` written and wired into all four mutating scripts. `_log/` initialized with first entries.

## Files

- `scripts/log-emit.sh` — append-only log emitter with optional `--validate-cmd` for LKG advance.
- `_log/operations.jsonl` — append-only versioned log (one JSON entry per line).
- `_log/heartbeat` — placeholder for F3-build-2.
- `_log/lkg.txt` — last-known-good version pointer; advances on success.

## Wiring

| Script | Hook |
|---|---|
| `propose.sh` | After writing the queue file. Actor = `$PROPOSED_BY`, action = `propose`, target = `queue/<filename>`. |
| `accept.sh` | After archiving and indexing. Actor = `human:main`, action = `accept`, target = `$TARGET_FILE_REL`. |
| `reject.sh` | After archiving. Actor = `human:main`, action = `reject`, target = `queue/_rejected/<filename>`. |
| `bootstrap-leaf.sh` | After writing leaf files. Actor = `human:main`, action = `bootstrap-leaf`, target = `distribution/<leaf>/CLAUDE.md`. |

`log-emit.sh` invocation is wrapped in `|| true` — if logging fails for any reason, the underlying mutation still succeeded. Logging is best-effort, never blocking. (When F3-build-2 lands heartbeat-watching, this becomes a `WARN` signal rather than silent.)

## Verified

After wiring, `bash scripts/bootstrap-leaf.sh 8azi-web-stub` produced log entry v=2. Both entries have correct `state_hash`, `lkg_at_emit`, `host`, and ISO timestamps. `lkg.txt` advanced to 2.

## Schema observations

- `state_hash` is computed via `shasum -a 256 <target_file>` if not passed explicitly. For multi-file operations (accept.sh modifies target + archives proposal), only the canonical target gets hashed. F3-build-3's recovery policy will need to handle multi-file operations specifically.
- `--validate-cmd` is optional and unused for V1 — a future hook can run `validate-providers.sh` or schema validators to gate LKG advance.

## Schema gaps surfaced

1. **Multi-file mutations have only one log entry.** `accept.sh` modifies the target, the proposal frontmatter, and moves the proposal file, but emits ONE log entry. Recovery from a partial accept needs ordered tracking; F3-build-3 will address.
2. **No log rotation policy.** `operations.jsonl` is append-forever. For a long-lived BBC, this needs trimming/compaction. Out of scope for V1.
3. **`hostname -s` may differ across hosts.** Used for de-confliction in F3-build-4. Need to formalize host identity (probably config-driven).
4. **No log-validate.sh yet.** F3 PLAN.md mentions a script that walks the log and checks state hashes against disk to advance LKG. Not built; F3-build-3 covers it.

## Next

F3-build-2..5 — heartbeat, promote, deconflict, UX. Skeletal in this batch since real failover testing needs infra (a remote log host, a Shadow VM). The log foundation is in place; the daemons can be built later.
