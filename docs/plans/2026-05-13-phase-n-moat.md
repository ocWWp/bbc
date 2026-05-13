# BBC Phase N — Moat Capabilities Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. **IMPORTANT:** Each milestone below has unknowns. Before executing any milestone, re-run `superpowers:brainstorming` on it to surface decisions the design doc deferred.

**Goal:** Ship the post-launch moat capabilities — adopt an agent runtime (Hermes Agent) so BBC's Studios can do autonomous multi-step work, wire a daily skill-discovery crawler that fetches and assesses new tools from Reddit / X / GitHub releases / npm / MCP registries, plumb BYOK premium-tool routing so user-provided keys flow to agents transparently, and add a "security drift" observation class to Loop 3.

**Architecture:** Each milestone slots into BBC's existing F4 binding layer, F1 credibility ranker, F2 skill inheritance system, and Loop 3 queue gate. **No native runtime built.** Hermes Agent (Nous Research, MIT, v0.9 pinned to a specific tag) is the default `agent-runtime` binding; LangGraph is the fallback if Hermes stalls. **BBC never holds credit** — all premium tool access flows through user-provided API keys at `/settings/keys`. The crawler is a Cloudflare Cron Triggers worker. See `docs/plans/2026-05-13-bbc-persona-nav-design.md` for the full strategic context.

**Tech Stack:** Existing BBC stack + Hermes Agent + Cloudflare Cron Triggers + Anthropic prompt-injection sandbox (already shipped per W2-4) + F1 ranker (already shipped per F1-build-1..4).

**Pre-execution gate:** Phase N MUST NOT start until v1.5 is shipped to production and the launch retro is done. v1.5 is the wedge; Phase N is the moat. Order matters — shipping Phase N without v1.5's persona-shaped surfaces means the moat lands on a confused UX.

**Reference docs:**
- `docs/plans/2026-05-13-bbc-persona-nav-design.md` — the design doc and moat sentence.
- `docs/plans/2026-05-13-v1.5-launch-polish.md` — the pre-launch plan; Phase N depends on its completion.
- `memory/decisions/0008-three-loop-architecture.md` — three-loop framing.
- `memory/decisions/0009-loop-3-scope.md` — Loop 3 observation classes; this plan amends it.
- [github.com/nousresearch/hermes-agent](https://github.com/nousresearch/hermes-agent) — proposed default `agent-runtime` binding.

---

## Milestone N.1 — `agent-runtime` role contract + Hermes Agent binding

**Goal:** Introduce `agent-runtime` as a distinct F4 role contract from `llm-provider`. Default-bind Hermes Agent. Prove the substrate works with a no-op agent that runs end-to-end.

**Pre-brainstorm needed:** YES. Open questions: where does Hermes run (self-hosted in the same Cloudflare worker, separate process, separate hosted service)? How does it consume the tenant's brain (via MCP server, via direct DB access, via a snapshot)? How does it talk to Anthropic/OpenAI through BBC's existing `llm-provider` binding without bypassing it?

**Tasks (high-level — flesh out post-brainstorm):**

1. Author `memory/ops/provider-roles/agent-runtime.yaml` defining the role contract (inputs: brain snapshot ref, prompt, tool kit, budget; outputs: result + cite chain + cost; SLAs: max steps, max tokens, timeout).
2. Author `memory/ops/providers/nous-hermes-agent.yaml` declaring the adapter (pin a Hermes version, e.g. v0.9.5).
3. Implement the adapter bridge in `apps/dashboard/src/lib/agent-runtime/` — translates BBC's role-contract shape to Hermes' API.
4. Wire `bindings.yaml` so tenants can choose `agent-runtime` providers.
5. Build a no-op "hello agent" test: a Studio invokes the runtime, the runtime says hello, citation chain returns. End-to-end smoke.
6. Add observability hooks — every agent run logs to `studio_runs` with `runtime_provider` column populated.

**Effort estimate:** 2-3 weeks. Largest uncertainty is the deployment model for Hermes itself.

**Exit criteria:** A test Studio can submit a prompt that runs through Hermes Agent and returns a cited response. The same call works if we flip the binding to a stub `agent-runtime=langgraph` adapter — proving the F4 abstraction holds.

---

## Milestone N.2 — First inter-agent capability

**Goal:** Marketing-agent → Designer-agent handoff for thumbnail generation. Prove agents can call each other through the runtime, not just call tools.

**Pre-brainstorm needed:** YES. Open questions: does the calling agent (Marketing) directly invoke the Designer-agent, or does it dispatch through a queue / shared scratchpad? How do citations from the inner agent (Designer) propagate up to the outer agent's final response? What happens if the inner agent fails or exceeds budget?

**Tasks (high-level):**

1. Define the inter-agent message shape — a typed request/response payload that includes the source brain snapshot ref, the requested action, the budget envelope, and the citation chain so far.
2. Implement `dispatchToAgent(role, request)` in the runtime — routes a call to the appropriate role-shaped agent.
3. Build the Designer-agent's thumbnail-generation tool (uses Higgsfield via BYOK, falls back to a free image model if no premium key).
4. Wire Marketing Studio's "launch announcement" template to optionally call out to Designer-agent for a thumbnail.
5. Test: user submits "draft a launch post for iOS with thumbnail" → Marketing-agent → Designer-agent → Higgsfield (or fallback) → thumbnail returned → Marketing-agent assembles final post with the thumbnail + cites.

**Effort estimate:** 2-3 weeks.

**Exit criteria:** The Marketing → Designer thumbnail flow works end-to-end in dev. Citations from both agents land in the final cite chain. Budget caps enforced.

---

## Milestone N.3 — Daily skill-discovery crawler

**Goal:** A scheduled worker that crawls Reddit / X / GitHub releases / npm / MCP registries daily, ranks new skills/tools via the F1 ranker, and surfaces high-trust ones into per-tenant Libraries.

**Pre-brainstorm needed:** YES. Open questions: which exact sources to crawl in v1 (priority and frequency per source)? What's the API access path for X (paid tier?)? How aggressive is the trust threshold for auto-propagation vs surface-as-recommendation? How does the F1 ranker score a new skill it's never seen before (cold start)?

**Tasks (high-level):**

1. Set up Cloudflare Cron Triggers (or a Supabase Edge Function on cron) to run daily at a fixed time.
2. Implement source crawlers:
   - **GitHub releases** — easy, well-documented API, filter by tags like "claude-skill", "agent-skill", "mcp-server".
   - **npm** — search for new packages tagged `mcp` or `agent-skill`.
   - **MCP registries** — query PulseMCP, Smithery, agentskill.sh endpoints (or scrape).
   - **Reddit** — r/ClaudeAI, r/LocalLLaMA, r/ChatGPTCoding filtered to "new tool" / "skill" posts.
   - **X** — defer to v2; auth is a paid tier blocker.
3. Each candidate runs through:
   - **Skill-injection sandbox** (already shipped per W2-4) — reject if it triggers any pattern.
   - **F1 ranker** scoring (combine cost / latency / trust / outcome history / preference match).
   - **License check** — must be OSS or BYOK-friendly.
4. High-scored candidates land in a new `tool_candidates` table for admin review.
5. Library "Recommended for you" reads from `tool_candidates` joined with the user's role profile.
6. Manual install path stays the same — Phase N doesn't auto-install anything.

**Effort estimate:** 3-4 weeks for v1 with conservative source coverage.

**Exit criteria:** The crawler runs daily, surfaces 3-10 high-quality candidates/day across tenants, and admins can install them with one click from Library.

---

## Milestone N.4 — BYOK premium-tool routing

**Goal:** When the user has plugged a Higgsfield / Replicate / paid-MCP key at `/settings/keys`, BBC's agents route through that key when they need premium tool capability. Never charge the user via BBC.

**Pre-brainstorm needed:** YES. Open questions: how does the agent decide "this task needs premium tool X"? Is it template-specified or agent-inferred? What's the fallback behavior if the user hasn't plugged a key? Do we surface "this template will use your Higgsfield key — confirm" at first run?

**Tasks (high-level):**

1. Extend the `secrets` table to support a `provider_id` discriminator so a single tenant can store multiple premium-tool keys.
2. Build a `getProviderKey(tenantId, providerId)` helper that fetches and decrypts the stored key.
3. In each tool adapter (Higgsfield, Replicate, premium MCP), accept an optional key parameter that overrides the no-key fallback path.
4. Surface in Studio: when a template would call a premium tool, show an info chip ("this run will use your Higgsfield key — $0.012 estimated"). If no key plugged, fall back to the free model and show why.
5. /settings/keys UI: list installed providers with rotate / remove actions.

**Effort estimate:** 1-2 weeks.

**Exit criteria:** User plugs a Higgsfield key. Marketing Studio's image-gen calls go through their key. The 30-day usage report shows zero charges to BBC. Removing the key cleanly falls back to the free path.

---

## Milestone N.5 — ADR-0009 amendment + Loop 3 security drift

**Goal:** Amend ADR-0009 to add "security drift" as a sixth observation class. Implement the five security-drift proposal types.

**Pre-brainstorm needed:** PARTIAL. The five proposal types are listed in the design doc; the open questions are about thresholds and signal-source plumbing.

**Tasks (high-level):**

1. **Write the amendment ADR** — `memory/decisions/0009a-loop-3-security-drift-amendment.md` (or supersede ADR-0009 with ADR-0009v2). Lists the new observation class, the five proposal types, the privacy floor (no PII), the threshold knobs.
2. **Stale API key proposal** — daily scan of `secrets.created_at`; propose rotation for keys >90 days. Test: a 100-day-old key in the test fixture surfaces in admin queue with the right body.
3. **Skill injection-sandbox trigger proposal** — joining `skill_runs` to `injection_sandbox_log`; surface skills that triggered the sandbox ≥3 times in 7 days. Test: a fixture with 4 triggers surfaces a "Block this skill?" proposal.
4. **Connector auth-expired proposal** — joining `tenant_connectors.last_sync_status='auth_expired'` count. If >2 in 7 days, propose re-auth.
5. **WAF spike proposal** — Cloudflare WAF logs (via Logpush → Supabase). If one IP has ≥1000 blocked requests in 7 days, surface "Review this IP?" in admin queue.
6. **Generic drift proposal** — catch-all for any security-relevant pattern not in 1-4.

**Effort estimate:** 2 weeks (ADR + 5 observation classes + tests).

**Exit criteria:** ADR amendment merged. All 5 proposal types fire on test fixtures. Admin queue surfaces a proposal-of-the-day with the right framing.

---

## Sequencing recommendation

Phase N milestones are dependency-ordered: N.1 (runtime) → N.2 (inter-agent) → N.4 (BYOK routing) can be done in parallel with N.3 (crawler) and N.5 (security drift) once N.1 is done.

Honest critical path: N.1 is the load-bearing milestone. If N.1 stalls (Hermes deployment, F4 abstraction breaks down), the rest of Phase N is blocked. Mitigation: spend the first week of N.1 prototyping just the binding layer with a stub adapter; commit to Hermes only after the F4 contract holds.

Total Phase N effort: ~12-16 weeks of focused work, parallelizable across 2-3 engineers post-launch.

---

## Critical reminder for the executor

**Each milestone needs its own brainstorm before plan-level execution.** This document is intentionally milestone-level, not TDD-step-level, because:

1. The unknowns (Hermes deployment shape, agent-call dispatching, crawler source priority, premium-tool detection heuristic) are not pre-resolvable.
2. Forcing TDD-step granularity now would invent details that get re-decided at brainstorm time anyway.
3. The brainstorming skill explicitly exists for this — use it per milestone.

**Workflow per milestone:**

1. Re-run `superpowers:brainstorming` on the milestone in a fresh worktree.
2. Brainstorm produces a milestone-specific design doc.
3. Run `superpowers:writing-plans` on the milestone design → produces a TDD-step plan.
4. Execute via `superpowers:subagent-driven-development` or `superpowers:executing-plans`.

This is the same loop v1.5 went through. Don't shortcut it for Phase N — the design surface is bigger and the assumptions are deeper.

---

## Related

- `docs/plans/2026-05-13-bbc-persona-nav-design.md` — the design doc.
- `docs/plans/2026-05-13-v1.5-launch-polish.md` — pre-launch plan (must ship before Phase N starts).
- `memory/decisions/0008-three-loop-architecture.md` and `memory/decisions/0009-loop-3-scope.md`.
- [github.com/nousresearch/hermes-agent](https://github.com/nousresearch/hermes-agent).
