---
name: bbc:promote
description: Manually trigger graceful failover (Shadow becomes Primary)
allowed-tools:
  - Bash
  - Read
---

<objective>
Manual trigger for the F3 promotion sequence. Used for:
- Planned graceful failover (e.g., maintenance on Primary).
- Emergency failover when shadow-watch.sh is not running but a human knows Primary is down.

NOT used for normal automatic failover — that's `shadow-watch.sh --loop` triggering `promote.sh` automatically.
</objective>

<process>
1. Detect layer. Refuse unless `layer == main`.

2. Read `<tenant>/_log/role` (where `<tenant>` is `$BBC_REPO` or current dir). If it says `primary`, refuse: "/bbc:promote is for Shadow → Primary transitions, not the reverse." Suggest writing a graceful-shutdown era-promotion if needed.

3. Confirm with user: "Promoting this host to Primary will append an era-promotion entry naming `<previous-primary>` as deposed. Continue? [y/N]"

4. On yes: `bash <bbc>/scripts/promote.sh` (with the tenant repo as cwd) and surface the output.

5. After success, tell user:
   - Start `bash <bbc>/scripts/heartbeat-emit.sh --loop` on this host (or set up systemd/cron).
   - Original Primary, when it wakes, MUST run `bash <bbc>/scripts/deconflict.sh` before any mutating script.

Do NOT auto-start the heartbeat daemon. Daemon-management is operator territory.
</process>

<refusal_examples>
- "/bbc:promote is Main-only."
- "Already Primary per <tenant>/_log/role; nothing to promote."
- "Cancelled — no era-promotion emitted."
</refusal_examples>
