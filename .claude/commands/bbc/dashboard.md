---
name: bbc:dashboard
description: Surface the 8azi-dashboard (PM tab) — print URL + run status, open in browser if running
allowed-tools:
  - Read
  - Bash
---

<objective>
Point the user at the visual front-end for BBC. The dashboard lives at `/Users/grid/Documents/GitHub/8azi-dashboard/` (Next.js 16, default port 3000) and reads BBC's `_log/`, `queue/`, and `bindings.yaml`.

Use this when the user says "open the dashboard", "/bbc:dashboard", or asks where the BBC UI is. If it isn't running, start it in the background, wait for it to come up, then open the browser.

Note on Main's principle #6 ("no silent autonomy"): that principle governs BBC *state changes* (memory writes, queue accepts, bindings flips). Starting a local dev server does none of those — it runs a developer process on the user's machine and exits with the session. So auto-starting here does not violate #6.
</objective>

<process>
1. Resolve dashboard path. Default: `/Users/grid/Documents/GitHub/8azi-dashboard`. If the path doesn't exist, print an error pointing at `bbc/distribution/dashboard/CLAUDE.md` and stop.

2. Detect run status. Probe `http://localhost:3000/` with a short timeout:
   ```bash
   curl -s -o /dev/null -w "%{http_code}" --max-time 2 http://localhost:3000/ || echo "down"
   ```
   - 2xx/3xx → running
   - 401 → running but auth-gated (still "up")
   - "down" or connection error → not running

3. Print a compact status block (see example_output). Always include:
   - Path, port, repo it shadows (BBC).
   - Run status.
   - The full route list from `8azi-dashboard/README.md` (`/`, `/queue`, `/queue/[id]`, `/skills`, `/graph`, `/log`, `/bindings`, `/auth/signin`).

4. If running: open in the default browser.
   ```bash
   open http://localhost:3000/
   ```

5. If not running: start it in the background, then wait for it.
   - If `8azi-dashboard/node_modules` is missing, run `npm install` first (foreground, in `8azi-dashboard/`).
   - Start `npm run dev` via the Bash tool with `run_in_background: true`, working directory `/Users/grid/Documents/GitHub/8azi-dashboard`.
   - Poll `http://localhost:3000/` every 1s for up to 30s using the same `curl` probe from step 2. Treat any HTTP response (including 401) as "up".
   - When up: print the status block (now showing "starting → up") and `open` the URL.
   - If it does not come up within 30s: print the start command and the path to background-task output, and stop.

6. The command may start a local dev process. It must NOT modify any BBC file (`memory/**`, `queue/**`, `bindings.yaml`, `_log/**`) or any dashboard source file.
</process>

<example_output>
```
=== BBC dashboard ===
Path:    /Users/grid/Documents/GitHub/8azi-dashboard
Shadows: bbc/  (read-only via fs + shell-out to scripts/{accept,reject}.sh)
URL:     http://localhost:3000/
Status:  up (HTTP 200)

Routes:
  /              overview
  /queue         pending proposals + Accept/Reject
  /queue/[id]    proposal detail
  /skills        slash commands + F2 hierarchy
  /graph         layer / folder / queue diagrams
  /log           operations log
  /bindings      role → adapter table
  /auth/signin   GitHub OAuth

Opened in browser.
```

If down:

```
=== BBC dashboard ===
Path:    /Users/grid/Documents/GitHub/8azi-dashboard
URL:     http://localhost:3000/
Status:  down

To start:
  cd /Users/grid/Documents/GitHub/8azi-dashboard
  npm run dev
```
</example_output>
