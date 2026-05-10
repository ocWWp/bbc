---
name: bbc:help
description: List all /bbc:* commands grouped by layer, with one-line purpose
allowed-tools:
  - Read
  - Bash
---

<objective>
Print a quick reference of every /bbc:* command available, grouped by which layer it's typically used at.

Use this whenever the user asks "what BBC commands are there?" or "/bbc help" or seems lost about how to do something in BBC.

Most BBC commands operate against a **tenant repo** — that's the repo holding `memory/`, `queue/`, `_log/`, `bindings.yaml`. The path is `$BBC_REPO` if set, otherwise the current working dir. The BBC product repo at `bbc/` is the **product code + protocol**; tenant content lives elsewhere.
</objective>

<process>
Call `bash <bbc>/scripts/which-layer.sh` to detect the current layer (main / manager / leaf / unknown). Print the user's current layer at the top of the output.

Then print the command table below, marking which commands apply at the user's current layer with a leading `*`.

```
=== /bbc:* commands ===
You are at: <layer>

Any layer:
  /bbc:status            Show layer + pending queue + recent accepts
  /bbc:bootstrap-leaf    Create or refresh a Distribution leaf
  /bbc:dashboard         Open the BBC dashboard (PM tab) — status + browser
  /bbc:help              This command

Distribution leaves and Manager:
  /bbc:propose           File a queued change request to a higher layer

Any layer (skill resolver):
  /bbc:invoke-skill      Resolve and surface a skill's effective body for current caller
  /bbc:skill-trace       Show the resolution chain without invoking

Any layer (failover):
  /bbc:failover-status   Show heartbeat age, LKG, role, last era-promotion

Main only (failover):
  /bbc:promote           Manually trigger graceful Shadow → Primary failover

Manager and Main:
  /bbc:bind              Bind an adapter to a role (writes to <tenant>/memory/ops/bindings.yaml via queue)
  /bbc:decommission      Walk a provider through Announce → Quarantine → Purge

Manager only:
  /bbc:review            Triage pending queue items (spawns queue-reviewer agent)

Main only:
  /bbc:accept            Apply an approved proposal to its target file

Read `<bbc>/CLAUDE.md` for the layer precedence rule.
Read `<bbc>/queue/README.md` for proposal mechanics.
Read `<bbc>/docs/tenant-repo-architecture.md` for the BBC product vs tenant repo split.
```

Do not invent commands not in this table.
</process>
