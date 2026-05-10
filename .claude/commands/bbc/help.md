---
name: bbc:help
description: List all /bbc:* commands grouped by layer, with one-line purpose
allowed-tools:
  - Read
  - Bash
---

<objective>
Print a quick reference of every /bbc:* command available in this BBC repo, grouped by which layer it's typically used at.

Use this whenever the user asks "what BBC commands are there?" or "/bbc help" or seems lost about how to do something in BBC.
</objective>

<process>
Call `bash bbc/scripts/which-layer.sh` to detect the current layer (main / manager / leaf / unknown). Print the user's current layer at the top of the output.

Then print the command table below, marking which commands apply at the user's current layer with a leading `*`.

```
=== /bbc:* commands ===
You are at: <layer>

Any layer:
  /bbc:status            Show layer + pending queue + recent accepts
  /bbc:bootstrap-leaf    Create or refresh a Distribution leaf
  /bbc:dashboard         Open the bbc-dashboard (PM tab) — status + browser
  /bbc:help              This command

Distribution leaves and Manager:
  /bbc:propose           File a queued change request to a higher layer

Any layer (skill resolver):
  /bbc:invoke            Resolve and surface a skill's effective body for current caller
  /bbc:skill-trace       Show the resolution chain without invoking

Any layer (failover):
  /bbc:failover-status   Show heartbeat age, LKG, role, last era-promotion

Main only (failover):
  /bbc:promote           Manually trigger graceful Shadow → Primary failover

Manager and Main:
  /bbc:bind              Bind an adapter to a role in memory/ops/bindings.yaml
  /bbc:decommission      Walk a provider through Announce → Quarantine → Purge

Manager only:
  /bbc:review            Triage pending queue items (spawns queue-reviewer agent)

Main only:
  /bbc:accept            Apply an approved proposal to its target file

Read `bbc/CLAUDE.md` for the layer precedence rule.
Read `bbc/queue/README.md` for proposal mechanics.
Read `.planning/phases/F4-provider-interface/PLAN.md` for F4 model.
```

Do not invent commands not in this table. If the user asks about /bbc:reject, /bbc:promote, or /bbc:health, say they are deferred to V1.1 and explain what the user can do today (`bash scripts/reject.sh ...`, `propose.sh --kind add`, manual sanity check).
</process>
