# v1.6 Agentic /home + Loop 3 Observer — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace BBC's `/home` Read/Make toggle with a conversational agent shell, and ship the first slice of Loop 3 — a PostHog metric observer that files queue proposals on anomalies via existing queue plumbing.

**Architecture:** One shared `lib/agent/` library set (context builder, tool registry, grounding verifier, proposal emitter, quota gate) consumed by two orchestration paths: `homeTurn()` (sync, user-authed, SSE-streamed) and `observerRun()` (async, service-actor, idempotent). Observer findings are staged inside queue items; a new `accept_proposal_observation()` RPC promotes them into `memory_files` only on accept. Cron is out of scope — v1.6 observer runs only via authenticated `POST /api/observer/run-now/:id`.

**Tech Stack:** Next.js 16 + React 19 (App Router), TypeScript, Cloudflare Workers via OpenNext, Supabase Postgres (RLS), Anthropic SDK (Sonnet + Haiku), Vitest, PostHog Query API.

**Design source:** `docs/plans/2026-05-15-agentic-home-design.md` (v3, two codex passes — read this before starting any milestone).

**Branch strategy:** Each milestone gets its own feature branch off main, merged via PR after the milestone's acceptance gate passes. Do NOT bundle milestones into one PR.

**Test discipline:** TDD throughout — failing test first, minimal impl, passing test, commit. Skip tests only with explicit reason in the commit message.

**Commands you will use a lot:**
```bash
pnpm --filter @bbc/dashboard test                          # full vitest suite
pnpm --filter @bbc/dashboard exec vitest run <path>        # single file
pnpm --filter @bbc/dashboard type-check                    # tsc --noEmit
pnpm --filter @bbc/dashboard build                         # next build
pnpm --filter @bbc/dashboard cf:build                      # OpenNext Cloudflare bundle
pnpm --filter @bbc/dashboard dev                           # local dev :3000
```

If `.next/types/* 2.ts` duplicates appear during type-check, delete them: `find apps/dashboard/.next/types -name "* 2.ts" -delete`.

---

## Pre-flight (do once, before M0)

### Task PF.1: Read the design doc end to end

**Files:** Read `docs/plans/2026-05-15-agentic-home-design.md` from the v3 commit.

**Step 1:** Read it.
**Step 2:** Open the existing `memory/decisions/0008-three-loop-architecture.md` and `memory/decisions/0009-loop-3-scope.md`. Confirm you understand: BBC's three-loop framing; that Loop 3 observation must file proposals into the existing queue; that ADR-0009 already exists and v1.6 will amend it, not create a new one.
**Step 3:** Skim `apps/dashboard/src/components/chat-home/ChatHome.tsx` — the file being replaced in M2.
**Step 4:** Skim `apps/dashboard/supabase/migrations/0040_propose_change.sql` — the RPC v1.6 will extend.

No commit for PF.1.

### Task PF.2: Verify the dev loop works on your machine

**Step 1:** Run `pnpm install` from repo root.
**Step 2:** Run `pnpm --filter @bbc/dashboard test`. Expected: all tests pass.
**Step 3:** Run `pnpm --filter @bbc/dashboard type-check`. Expected: clean (delete `.next/types/* 2.ts` if needed).
**Step 4:** Run `pnpm --filter @bbc/dashboard dev`. Expected: server boots on :3000.
**Step 5:** Open `localhost:3000/home` (after signing in to your local Supabase tenant). Confirm the current Read/Make UI renders. This is the baseline you're replacing.

No commit for PF.2.

---

## M0 — Phase M scope ADR + per-table migration policy (week 1)

**Goal:** Lock the governance gates before any code lands. Output: ADR-0009 moved to `accepted` status with v1.6-specific amendments, plus a per-table migration policy document.

**Branch:** `v16-m0-governance` off `main`.

### Task M0.1: Open the v16-m0-governance branch

**Step 1:** `git checkout main && git pull --ff-only`
**Step 2:** `git checkout -b v16-m0-governance`

No commit.

### Task M0.2: Audit ADR-0009 against v1.6 scope

**Files:** Read `memory/decisions/0009-loop-3-scope.md` in full.

**Step 1:** For each section ("What Loop 3 observes", "What Loop 3 proposes", "Privacy floor", "Trigger frequency", "Who owns Loop 3 proposals"), note whether it covers v1.6's actual needs.
**Step 2:** Write your findings to a scratch file `docs/plans/2026-05-15-adr-0009-audit-notes.md` (gitignored — do not commit). Include: bullets for each section, sentence verdict (covered / partial / missing), one-line gap if partial/missing.
**Step 3:** Specifically check whether ADR-0009 expresses signal sources as **capability classes** vs vendor whitelist. If it's vendor whitelist, the amendment in M0.3 must rewrite it.

No commit. The notes file is your worksheet, not a deliverable.

### Task M0.3: Write the ADR-0009 v1.6 amendment

**Files:**
- Modify: `memory/decisions/0009-loop-3-scope.md`

**Step 1:** Add a new section to ADR-0009 titled `## v1.6 amendment (2026-05-15)`. Cover:
- Reframe signal sources as **capability classes**: each class declares scope, retention, PII policy, baseline method, kill-switch, cost model.
- v1.6 ships exactly one adapter (`posthog.metric`) implementing the "read-only signal adapter" class. Future adapters under the same class do not need an ADR amendment.
- Hard constraints (no external writes, no cross-tenant aggregation, no autonomy past queue, no silent state changes).
- v1.6 observer is **manual trigger only**. Cron deferred to v1.7.
- Update the frontmatter `status:` from `proposed` to `accepted` and bump `updated:` to today.

**Step 2:** Run `pnpm --filter @bbc/dashboard test` (sanity check; no test changes expected).
**Step 3:** Commit.

```bash
git add memory/decisions/0009-loop-3-scope.md
git commit -m "docs(adr): amend ADR-0009 with v1.6 scope (capability classes, manual-trigger observer)"
```

### Task M0.4: Write the per-table migration policy document

**Files:**
- Create: `docs/plans/2026-05-15-agentic-home-migration-policy.md`

**Step 1:** For each of these tables that v1.6 introduces, write a section specifying: RLS policy (in plain English, with the SQL clause), retention (in days), mutable vs append-only fields, RPC ownership (which functions can write), tenant-deletion cascade behavior, observability (operations_log entries). Tables:
- `home_sessions`
- `home_turns`
- `observer_signals`
- `observer_runs`
- `tenant_quotas`

**Step 2:** Reference the existing pattern. Read `apps/dashboard/supabase/migrations/0007_operations_log_bindings_proposals_audit.sql` and `apps/dashboard/supabase/migrations/0039_rbac_rpc_gates.sql` for examples of append-only + RLS-gated table patterns. Cite them.

**Step 3:** Commit.

```bash
git add docs/plans/2026-05-15-agentic-home-migration-policy.md
git commit -m "docs(v1.6): per-table migration policy for home/observer/quota tables"
```

### Task M0.5: Define the `observation` memory supertag spec (or pick a reuse path)

**Files:**
- Modify: `memory/_schema.md` (or create `docs/plans/2026-05-15-observation-supertag.md` if you decide to defer the schema change)

**Step 1:** Decide: does v1.6 add a new `observation` supertag to the memory schema, or reuse `note`/`incident`?
- Recommendation: add `observation`. The frontmatter shape needs `observer_run_id`, `signal_source`, `anomaly_summary`, `baseline_window` which don't fit cleanly into `note`.
**Step 2:** If adding: update `memory/_schema.md` with the new type and its required frontmatter fields. If reusing: write the rationale + the frontmatter convention to the deferral doc.
**Step 3:** Commit.

```bash
git add memory/_schema.md  # or the deferral doc
git commit -m "docs(memory): add 'observation' supertag for Loop 3 observer findings"
```

### Task M0.6: Open M0 PR and merge

**Step 1:** Push branch: `git push -u origin v16-m0-governance`
**Step 2:** Open PR via `gh pr create` with title "v1.6 M0: governance gates (ADR-0009 amendment + migration policy + observation supertag)".
**Step 3:** Wait for review / self-approve / merge. Do NOT continue to M1 until merged.

**M0 acceptance gate:**
- [ ] ADR-0009 status is `accepted` with v1.6 amendment section
- [ ] Migration policy doc covers all 5 new tables
- [ ] Memory schema decision recorded (`observation` supertag added or deferral documented)
- [ ] M0 PR merged into main

---

## M1 — Agent libraries + SSE Route Handler spike (weeks 2-3)

**Goal:** Ship the shared `lib/agent/` libraries with tests, and prove SSE streaming works through deployed Cloudflare Workers. M1's SSE spike is a **hard gate** — if it fails, fall back to long-polling before M2 starts.

**Branch:** `v16-m1-agent-libs` off `main`.

### Task M1.1: Open branch + scaffold

**Step 1:** `git checkout main && git pull --ff-only && git checkout -b v16-m1-agent-libs`
**Step 2:** Create the directory: `mkdir -p apps/dashboard/src/lib/agent`
**Step 3:** Create empty `apps/dashboard/src/lib/agent/index.ts` (you'll fill it as exports land).

No commit yet.

### Task M1.2: SSE Route Handler spike — proof of life

**Goal:** Before building any agent logic, prove a Route Handler can stream `text/event-stream` through `wrangler dev` AND through a deployed Cloudflare Worker. If this fails, switch the wire protocol to long-polling.

**Files:**
- Create: `apps/dashboard/src/app/api/_spike/stream/route.ts`
- Create: `apps/dashboard/src/app/api/_spike/stream/route.test.ts`

**Step 1: Write a route that streams.**

```typescript
// apps/dashboard/src/app/api/_spike/stream/route.ts
import { NextRequest } from "next/server";

export const runtime = "edge";

export async function GET(_req: NextRequest) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      for (let i = 0; i < 5; i++) {
        controller.enqueue(encoder.encode(`event: tick\ndata: {"i":${i}}\n\n`));
        await new Promise((r) => setTimeout(r, 200));
      }
      controller.enqueue(encoder.encode(`event: done\ndata: {}\n\n`));
      controller.close();
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
```

**Step 2: Test it locally with `pnpm dev`.**

Run: `curl -N http://localhost:3000/api/_spike/stream`
Expected: 5 tick events 200ms apart, then `done`. Time-to-first-byte under 300ms.

**Step 3: Test it through `wrangler dev` (preview Cloudflare runtime).**

```bash
pnpm --filter @bbc/dashboard cf:build
pnpm --filter @bbc/dashboard wrangler dev
curl -N http://localhost:8787/api/_spike/stream
```

Expected: same output. If buffering instead of streaming, document the symptom and stop — escalate to user.

**Step 4: Deploy to a Cloudflare preview environment.**

```bash
pnpm --filter @bbc/dashboard cf:deploy --env preview
curl -N https://<preview-host>/api/_spike/stream
```

Expected: same output, deployed. If preview env not set up yet, set it up via `wrangler.toml` `[env.preview]` block first. **Hard gate** — if streaming fails here, the v1.6 wire protocol must change before M2.

**Step 5: Decision point.**

- If SSE works: continue to M1.3.
- If SSE buffers/breaks on deployed Workers: switch design doc and PLAN.md to use long-polling. Update `docs/plans/2026-05-15-agentic-home-design.md` "Wire protocol" section accordingly. This is an escalation moment.

**Step 6: Commit the spike (regardless of outcome — it documents the decision).**

```bash
git add apps/dashboard/src/app/api/_spike/stream
git commit -m "spike(sse): prove text/event-stream works through wrangler dev + deployed Worker"
```

### Task M1.3: Define `AgentContext` type

**Files:**
- Create: `apps/dashboard/src/lib/agent/types.ts`
- Create: `apps/dashboard/src/lib/agent/types.test.ts`

**Step 1: Write the types.**

```typescript
// types.ts
export type Role = "admin" | "operator" | "member" | "viewer";

export type ConversationTurn = {
  role: "user" | "agent";
  text: string;
  citations?: string[];
};

export type AnomalyContext = {
  signalType: "posthog.metric";
  signalId: string;
  metricName: string;
  delta: number;
  windowSnapshot: unknown;
};

export type AgentContext = {
  tenantId: string;
  actorId: string | null;       // null for observer (service actor)
  role: Role;
  rolePack: {
    voice: string;
    vendors: string[];
    decisions: Array<{ id: string; title: string }>;
    glossary: Record<string, string>;
  };
  buffer:
    | { kind: "conversation"; turns: ConversationTurn[]; userInput: string }
    | { kind: "anomaly"; anomaly: AnomalyContext };
  alwaysOn: { memoryIndexExcerpt: string; workspaceName: string };
};

export type Intent =
  | "navigate"
  | "explain"
  | "draft"
  | "watch"
  | "meta"
  | "unclear"
  | "observe-anomaly";
```

**Step 2: Write a test that asserts type discriminants.**

```typescript
// types.test.ts
import { describe, it, expectTypeOf } from "vitest";
import type { AgentContext } from "./types";

describe("AgentContext", () => {
  it("buffer discriminates by kind", () => {
    const c: AgentContext["buffer"] = { kind: "conversation", turns: [], userInput: "" };
    if (c.kind === "conversation") expectTypeOf(c.userInput).toBeString();
  });
});
```

**Step 3: Run tests.**

```bash
pnpm --filter @bbc/dashboard exec vitest run src/lib/agent/types.test.ts
```

Expected: pass.

**Step 4: Commit.**

```bash
git add apps/dashboard/src/lib/agent/types.ts apps/dashboard/src/lib/agent/types.test.ts apps/dashboard/src/lib/agent/index.ts
git commit -m "feat(agent): AgentContext + Intent type contract"
```

### Task M1.4: `AgentContextBuilder` — assemble context from tenant state

**Files:**
- Create: `apps/dashboard/src/lib/agent/context-builder.ts`
- Create: `apps/dashboard/src/lib/agent/context-builder.test.ts`

**Step 1: Write the failing test.**

```typescript
// context-builder.test.ts
import { describe, it, expect, vi } from "vitest";
import { buildAgentContext } from "./context-builder";

describe("buildAgentContext", () => {
  it("assembles role pack + always-on excerpt for a conversation turn", async () => {
    const fakeDb = {
      getRolePack: vi.fn().mockResolvedValue({
        voice: "concise",
        vendors: ["anthropic"],
        decisions: [{ id: "0008", title: "three-loop" }],
        glossary: {},
      }),
      getMemoryIndexExcerpt: vi.fn().mockResolvedValue("- decision: 0008"),
      getWorkspaceName: vi.fn().mockResolvedValue("acme"),
    };
    const ctx = await buildAgentContext({
      tenantId: "t1",
      actorId: "u1",
      role: "admin",
      kind: "conversation",
      conversation: { turns: [], userInput: "where is admin dashboard" },
      db: fakeDb,
    });
    expect(ctx.rolePack.decisions[0].id).toBe("0008");
    expect(ctx.buffer.kind).toBe("conversation");
    if (ctx.buffer.kind === "conversation") {
      expect(ctx.buffer.userInput).toBe("where is admin dashboard");
    }
    expect(ctx.alwaysOn.workspaceName).toBe("acme");
  });
});
```

**Step 2: Run and verify it fails.**

Run: `pnpm --filter @bbc/dashboard exec vitest run src/lib/agent/context-builder.test.ts`
Expected: FAIL with "buildAgentContext is not defined".

**Step 3: Write the implementation.**

```typescript
// context-builder.ts
import type { AgentContext, Role, ConversationTurn, AnomalyContext } from "./types";

export type ContextDb = {
  getRolePack: (tenantId: string, role: Role) => Promise<AgentContext["rolePack"]>;
  getMemoryIndexExcerpt: (tenantId: string) => Promise<string>;
  getWorkspaceName: (tenantId: string) => Promise<string>;
};

type BuildArgs = {
  tenantId: string;
  actorId: string | null;
  role: Role;
  db: ContextDb;
} & (
  | { kind: "conversation"; conversation: { turns: ConversationTurn[]; userInput: string } }
  | { kind: "anomaly"; anomaly: AnomalyContext }
);

export async function buildAgentContext(args: BuildArgs): Promise<AgentContext> {
  const [rolePack, memoryIndexExcerpt, workspaceName] = await Promise.all([
    args.db.getRolePack(args.tenantId, args.role),
    args.db.getMemoryIndexExcerpt(args.tenantId),
    args.db.getWorkspaceName(args.tenantId),
  ]);
  const buffer: AgentContext["buffer"] =
    args.kind === "conversation"
      ? { kind: "conversation", ...args.conversation }
      : { kind: "anomaly", anomaly: args.anomaly };
  return {
    tenantId: args.tenantId,
    actorId: args.actorId,
    role: args.role,
    rolePack,
    buffer,
    alwaysOn: { memoryIndexExcerpt, workspaceName },
  };
}
```

**Step 4: Run tests, verify pass.**
**Step 5: Add a test for the anomaly path** (mirror the conversation test).
**Step 6: Commit.**

```bash
git add apps/dashboard/src/lib/agent/context-builder.ts apps/dashboard/src/lib/agent/context-builder.test.ts
git commit -m "feat(agent): AgentContextBuilder with conversation + anomaly buffers"
```

### Task M1.5: `ToolRegistry` — declare v1.6 tools + their scopes

**Files:**
- Create: `apps/dashboard/src/lib/agent/tools.ts`
- Create: `apps/dashboard/src/lib/agent/tools.test.ts`

**Step 1: Write failing test.**

```typescript
import { describe, it, expect } from "vitest";
import { TOOLS, toolsForIntent } from "./tools";

describe("tools", () => {
  it("declares the 6 v1.6 tools with scopes", () => {
    const names = TOOLS.map((t) => t.name);
    expect(names).toEqual([
      "memory_search",
      "memory_fetch",
      "route_match",
      "studio_compose",
      "observer_propose",
      "observation_emit",
    ]);
  });
  it("toolsForIntent narrows by intent", () => {
    expect(toolsForIntent("navigate").map((t) => t.name)).toContain("route_match");
    expect(toolsForIntent("navigate").map((t) => t.name)).not.toContain("observation_emit");
    expect(toolsForIntent("observe-anomaly").map((t) => t.name)).toContain("observation_emit");
  });
  it("every tool is marked internal-only for v1.6", () => {
    for (const t of TOOLS) expect(t.scope).toBe("internal");
  });
});
```

**Step 2: Run, verify fail.**
**Step 3: Implement.**

```typescript
import type { Intent } from "./types";

export type ToolDef = {
  name: string;
  description: string;
  scope: "internal";           // v1.6 — external scope added in v1.7
  inputSchema: Record<string, unknown>;
};

export const TOOLS: ToolDef[] = [
  { name: "memory_search", scope: "internal", description: "Search tenant memory", inputSchema: { type: "object", properties: { query: { type: "string" }, kinds: { type: "array", items: { type: "string" } }, limit: { type: "number" } }, required: ["query"] } },
  { name: "memory_fetch", scope: "internal", description: "Fetch one memory by id", inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] } },
  { name: "route_match", scope: "internal", description: "Map a navigation phrase to a route", inputSchema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } },
  { name: "studio_compose", scope: "internal", description: "Compose a draft via existing studio template", inputSchema: { type: "object", properties: { role: { type: "string" }, template: { type: "string" }, inputs: { type: "object" } }, required: ["role", "template"] } },
  { name: "observer_propose", scope: "internal", description: "Preview a watch proposal (no persistence)", inputSchema: { type: "object", properties: { metric: { type: "string" }, signalType: { type: "string" } }, required: ["metric"] } },
  { name: "observation_emit", scope: "internal", description: "Emit an observation finding (queue-first)", inputSchema: { type: "object", properties: { signalId: { type: "string" }, anomaly: { type: "object" }, hypothesis: { type: "string" }, citations: { type: "array", items: { type: "string" } } }, required: ["signalId", "anomaly", "hypothesis"] } },
];

const BY_INTENT: Record<Intent, string[]> = {
  navigate: ["route_match"],
  explain: ["memory_search", "memory_fetch"],
  draft: ["memory_search", "memory_fetch", "studio_compose"],
  watch: ["observer_propose"],
  meta: ["memory_search"],
  unclear: [],
  "observe-anomaly": ["memory_search", "memory_fetch", "observation_emit"],
};

export function toolsForIntent(intent: Intent): ToolDef[] {
  const allowed = BY_INTENT[intent];
  return TOOLS.filter((t) => allowed.includes(t.name));
}
```

**Step 4: Run, verify pass.**
**Step 5: Commit.**

```bash
git add apps/dashboard/src/lib/agent/tools.ts apps/dashboard/src/lib/agent/tools.test.ts
git commit -m "feat(agent): ToolRegistry with intent-narrowed tool kits"
```

### Task M1.6: `GroundingVerifier` — strip ungrounded claims

**Files:**
- Create: `apps/dashboard/src/lib/agent/grounding.ts`
- Create: `apps/dashboard/src/lib/agent/grounding.test.ts`

**Step 1: Write failing tests covering the key behaviors.**

```typescript
import { describe, it, expect } from "vitest";
import { verifyGrounding } from "./grounding";

describe("verifyGrounding", () => {
  it("keeps claims with valid citation markers", () => {
    const result = verifyGrounding("Churn rose 12% [mem:0042].", ["0042"]);
    expect(result.text).toBe("Churn rose 12% [mem:0042].");
    expect(result.citations).toEqual(["0042"]);
    expect(result.ungroundedClaims).toEqual([]);
  });
  it("strips claims that cite memory IDs not in the retrieved set", () => {
    const result = verifyGrounding("Churn rose 12% [mem:9999].", ["0042"]);
    expect(result.text).not.toContain("9999");
    expect(result.citations).toEqual([]);
    expect(result.ungroundedClaims.length).toBeGreaterThan(0);
  });
  it("downgrades a sentence to 'related memories' fallback when nothing grounds", () => {
    const result = verifyGrounding(
      "Churn rose 12% this week. [mem:9999]",
      ["0042"],
    );
    expect(result.text).toMatch(/related memories|found these related/i);
  });
  it("passes through inference markers without flagging", () => {
    const result = verifyGrounding(
      "This [inference: tentative] may be due to seasonality.",
      [],
    );
    expect(result.text).toContain("[inference: tentative]");
    expect(result.ungroundedClaims).toEqual([]);
  });
});
```

**Step 2: Run, verify fail.**
**Step 3: Implement.**

```typescript
export type GroundingResult = {
  text: string;
  citations: string[];        // valid mem IDs that survived verification
  ungroundedClaims: string[]; // sentences that got stripped or downgraded
};

const MEM_MARKER = /\[mem:([a-zA-Z0-9_-]+)\]/g;

export function verifyGrounding(text: string, retrievedIds: readonly string[]): GroundingResult {
  const valid = new Set(retrievedIds);
  const citations: string[] = [];
  const ungrounded: string[] = [];
  // Split into sentences; for each, check if it contains a memory marker, and if so, whether the marker is valid.
  const sentences = text.split(/(?<=[.!?])\s+/);
  const kept: string[] = [];
  for (const s of sentences) {
    const markers = [...s.matchAll(MEM_MARKER)].map((m) => m[1]);
    if (markers.length === 0) {
      // No citation. Allow if it has an inference marker, else accept (it's not a memory-grounded claim).
      kept.push(s);
      continue;
    }
    const invalid = markers.filter((id) => !valid.has(id));
    if (invalid.length === 0) {
      kept.push(s);
      citations.push(...markers);
      continue;
    }
    // Has invalid markers — downgrade.
    ungrounded.push(s);
  }
  let finalText = kept.join(" ");
  if (ungrounded.length > 0) {
    finalText += (finalText ? " " : "") + "I found these related memories — but couldn't ground a specific claim.";
  }
  return { text: finalText, citations: [...new Set(citations)], ungroundedClaims: ungrounded };
}
```

**Step 4: Run, verify pass.**
**Step 5: Commit.**

```bash
git add apps/dashboard/src/lib/agent/grounding.ts apps/dashboard/src/lib/agent/grounding.test.ts
git commit -m "feat(agent): GroundingVerifier strips ungrounded claims, not just chips"
```

### Task M1.7: `QuotaGate` — design only (RPC migration lives in M4)

**Files:**
- Create: `apps/dashboard/src/lib/agent/quota.ts`
- Create: `apps/dashboard/src/lib/agent/quota.test.ts`

For M1, write the TypeScript contract + tests against a fake DB. The actual `reserve_quota` / `reconcile_quota` SQL RPCs ship in M4.

**Step 1: Write failing test against a mock RPC.**

```typescript
import { describe, it, expect, vi } from "vitest";
import { reserveQuota, reconcileQuota } from "./quota";

describe("QuotaGate", () => {
  it("returns ok when reservation succeeds", async () => {
    const rpc = vi.fn().mockResolvedValue({ ok: true, reservationId: "r1" });
    const result = await reserveQuota({ tenantId: "t1", actorId: "u1", estimatedTokens: 500, kind: "home_turn" }, rpc);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.reservationId).toBe("r1");
  });
  it("returns exhausted when budget is gone", async () => {
    const rpc = vi.fn().mockResolvedValue({ ok: false, reason: "tokens_exceeded" });
    const result = await reserveQuota({ tenantId: "t1", actorId: "u1", estimatedTokens: 500, kind: "home_turn" }, rpc);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("tokens_exceeded");
  });
  it("reconcileQuota records actual usage", async () => {
    const rpc = vi.fn().mockResolvedValue({ ok: true });
    await reconcileQuota({ reservationId: "r1", actualTokens: 420 }, rpc);
    expect(rpc).toHaveBeenCalledWith({ reservation_id: "r1", actual_tokens: 420 });
  });
});
```

**Step 2: Run, verify fail.**
**Step 3: Implement.**

```typescript
export type QuotaKind = "home_turn" | "observer_run";

export type ReserveArgs = { tenantId: string; actorId: string | null; estimatedTokens: number; kind: QuotaKind };
export type ReserveResult = { ok: true; reservationId: string } | { ok: false; reason: string };

type ReserveRpc = (args: ReserveArgs) => Promise<ReserveResult>;
type ReconcileRpc = (args: { reservation_id: string; actual_tokens: number }) => Promise<{ ok: boolean }>;

export async function reserveQuota(args: ReserveArgs, rpc: ReserveRpc): Promise<ReserveResult> {
  return rpc(args);
}

export async function reconcileQuota(args: { reservationId: string; actualTokens: number }, rpc: ReconcileRpc) {
  return rpc({ reservation_id: args.reservationId, actual_tokens: args.actualTokens });
}
```

**Step 4: Run, verify pass.**
**Step 5: Commit.**

```bash
git add apps/dashboard/src/lib/agent/quota.ts apps/dashboard/src/lib/agent/quota.test.ts
git commit -m "feat(agent): QuotaGate TS contract (RPC migration in M4)"
```

### Task M1.8: `classifyIntent` — Haiku-tier intent classifier (mocked for v1.6)

**Files:**
- Create: `apps/dashboard/src/lib/agent/classify.ts`
- Create: `apps/dashboard/src/lib/agent/classify.test.ts`

**Step 1: Write failing test with mocked Anthropic SDK.**

```typescript
import { describe, it, expect, vi } from "vitest";
import { classifyIntent } from "./classify";

describe("classifyIntent", () => {
  it("returns the model's chosen intent", async () => {
    const llm = vi.fn().mockResolvedValue({ intent: "navigate" });
    const result = await classifyIntent("where is admin dashboard?", [], llm);
    expect(result).toBe("navigate");
  });
  it("falls back to 'unclear' on model failure", async () => {
    const llm = vi.fn().mockRejectedValue(new Error("rate limit"));
    const result = await classifyIntent("hi", [], llm);
    expect(result).toBe("unclear");
  });
});
```

**Step 2: Run, verify fail.**
**Step 3: Implement.**

```typescript
import type { ConversationTurn, Intent } from "./types";

type ClassifierLlm = (input: { text: string; recent: ConversationTurn[] }) => Promise<{ intent: Intent }>;

export async function classifyIntent(
  text: string,
  recent: readonly ConversationTurn[],
  llm: ClassifierLlm,
): Promise<Intent> {
  try {
    const r = await llm({ text, recent: recent.slice(-2) as ConversationTurn[] });
    return r.intent;
  } catch {
    return "unclear";
  }
}
```

**Step 4: Run, verify pass.**
**Step 5: Commit.**

```bash
git add apps/dashboard/src/lib/agent/classify.ts apps/dashboard/src/lib/agent/classify.test.ts
git commit -m "feat(agent): classifyIntent with Haiku-tier LLM injection + unclear fallback"
```

### Task M1.9: `ProposalEmitter` — wrap existing `propose_change` RPC

**Files:**
- Create: `apps/dashboard/src/lib/agent/proposal-emitter.ts`
- Create: `apps/dashboard/src/lib/agent/proposal-emitter.test.ts`

**Step 1: Write failing test.**

```typescript
import { describe, it, expect, vi } from "vitest";
import { emitObservationProposal } from "./proposal-emitter";

describe("emitObservationProposal", () => {
  it("calls propose_change with change_kind='add' and observer_run_id frontmatter", async () => {
    const rpc = vi.fn().mockResolvedValue({ ok: true, queueItemId: "q1" });
    const result = await emitObservationProposal({
      tenantId: "t1",
      observerRunId: "r1",
      stagedFinding: { hypothesis: "churn up 12%", citations: ["0042"], anomaly: { delta: 0.12 } },
    }, rpc);
    expect(result.ok).toBe(true);
    const call = rpc.mock.calls[0][0];
    expect(call.change_kind).toBe("add");
    expect(call.frontmatter.observer_run_id).toBe("r1");
  });
});
```

**Step 2: Run, verify fail.**
**Step 3: Implement.**

```typescript
type ProposeChangeRpc = (args: {
  tenantId: string;
  change_kind: "add";
  target_path: string;
  body: string;
  frontmatter: Record<string, unknown>;
}) => Promise<{ ok: true; queueItemId: string } | { ok: false; error: string }>;

export async function emitObservationProposal(
  args: {
    tenantId: string;
    observerRunId: string;
    stagedFinding: { hypothesis: string; citations: string[]; anomaly: Record<string, unknown> };
  },
  rpc: ProposeChangeRpc,
) {
  return rpc({
    tenantId: args.tenantId,
    change_kind: "add",
    target_path: `memory/observations/${args.observerRunId}.md`,
    body: args.stagedFinding.hypothesis,
    frontmatter: {
      type: "observation",
      observer_run_id: args.observerRunId,
      citations: args.stagedFinding.citations,
      anomaly: args.stagedFinding.anomaly,
    },
  });
}
```

**Step 4: Run, verify pass.**
**Step 5: Commit.**

```bash
git add apps/dashboard/src/lib/agent/proposal-emitter.ts apps/dashboard/src/lib/agent/proposal-emitter.test.ts
git commit -m "feat(agent): ProposalEmitter wraps propose_change with observation frontmatter"
```

### Task M1.10: `homeTurn` orchestrator — wires libraries for the sync path

**Files:**
- Create: `apps/dashboard/src/lib/agent/home-turn.ts`
- Create: `apps/dashboard/src/lib/agent/home-turn.test.ts`

This is the largest piece in M1. It composes everything above behind an SSE-shaped event emitter. Keep it pure (no DB/LLM imports — they're injected).

**Step 1: Write failing tests covering the happy path + the quota-exhausted path.**

```typescript
import { describe, it, expect, vi } from "vitest";
import { homeTurn } from "./home-turn";

describe("homeTurn", () => {
  it("emits text-delta, citation, and turn-end on a successful navigate", async () => {
    const events: any[] = [];
    await homeTurn(
      {
        tenantId: "t1",
        actorId: "u1",
        role: "admin",
        userInput: "where is admin dashboard?",
        recent: [],
      },
      {
        reserveQuota: vi.fn().mockResolvedValue({ ok: true, reservationId: "r1" }),
        reconcileQuota: vi.fn().mockResolvedValue({ ok: true }),
        buildContext: vi.fn().mockResolvedValue({
          tenantId: "t1", actorId: "u1", role: "admin",
          rolePack: { voice: "", vendors: [], decisions: [], glossary: {} },
          buffer: { kind: "conversation", turns: [], userInput: "where is admin dashboard?" },
          alwaysOn: { memoryIndexExcerpt: "", workspaceName: "acme" },
        }),
        classify: vi.fn().mockResolvedValue("navigate"),
        invokeLlm: vi.fn().mockResolvedValue({
          text: "Open the admin dashboard at /dashboard.",
          toolCalls: [{ name: "route_match", input: { query: "admin dashboard" }, output: { route: "/dashboard", label: "Dashboard" } }],
          tokens: 320,
        }),
        retrievedMemoryIds: [],
      },
      (e) => events.push(e),
    );
    const kinds = events.map((e) => e.event);
    expect(kinds).toContain("text-delta");
    expect(kinds).toContain("action-card");
    expect(kinds[kinds.length - 1]).toBe("turn-end");
  });
  it("emits a single turn-end with error when quota is exhausted", async () => {
    const events: any[] = [];
    await homeTurn(
      { tenantId: "t1", actorId: "u1", role: "admin", userInput: "x", recent: [] },
      {
        reserveQuota: vi.fn().mockResolvedValue({ ok: false, reason: "tokens_exceeded" }),
        reconcileQuota: vi.fn(),
        buildContext: vi.fn(),
        classify: vi.fn(),
        invokeLlm: vi.fn(),
        retrievedMemoryIds: [],
      },
      (e) => events.push(e),
    );
    expect(events.some((e) => e.event === "text-delta" && /budget/i.test(e.data.delta))).toBe(true);
    expect(events[events.length - 1].event).toBe("turn-end");
  });
});
```

**Step 2: Run, verify fail.**
**Step 3: Implement** (keep it tight — it's just orchestration glue calling injected deps and emitting events).
**Step 4: Run, verify pass.**
**Step 5: Add tests** for: ungrounded claim downgrading via `verifyGrounding`; observe-anomaly intent skipping classifier (verify `classify` is NOT called).
**Step 6: Commit.**

```bash
git add apps/dashboard/src/lib/agent/home-turn.ts apps/dashboard/src/lib/agent/home-turn.test.ts
git commit -m "feat(agent): homeTurn orchestrator with quota gate + classifier + grounding verifier + SSE event emission"
```

### Task M1.11: `observerRun` orchestrator — async path

**Files:**
- Create: `apps/dashboard/src/lib/agent/observer-run.ts`
- Create: `apps/dashboard/src/lib/agent/observer-run.test.ts`

**Step 1: Write failing tests** covering: anomaly detected → emits proposal; no anomaly → emits nothing; quota exhausted → skips + logs.

**Step 2: Implement.** Composes: pollSignal (injected) → detectAnomaly (Z-score) → buildContext → invokeLlm → verifyGrounding → stage finding → emitObservationProposal → log to observer_runs (via injected DB).

**Step 3: Commit.**

```bash
git add apps/dashboard/src/lib/agent/observer-run.ts apps/dashboard/src/lib/agent/observer-run.test.ts
git commit -m "feat(agent): observerRun orchestrator — pollSignal → detect anomaly → emit proposal"
```

### Task M1.12: Library statelessness audit

**Files:**
- Create: `apps/dashboard/src/lib/agent/STATELESSNESS.md`

**Step 1:** Walk every file in `apps/dashboard/src/lib/agent/`. For each export, verify: no module-level mutable state, no top-level side effects, every DB/LLM dependency is injected. Write the audit table.
**Step 2:** If any module fails the audit, refactor.
**Step 3:** Commit.

```bash
git add apps/dashboard/src/lib/agent/STATELESSNESS.md
git commit -m "docs(agent): library statelessness audit (every dep injected, no module mutable state)"
```

### Task M1.13: M1 PR + acceptance gate

**Step 1:** `pnpm --filter @bbc/dashboard test` — verify all M1 tests pass.
**Step 2:** `pnpm --filter @bbc/dashboard type-check` — clean.
**Step 3:** Push, open PR titled "v1.6 M1: agent libraries + SSE Route Handler spike".
**Step 4:** PR body documents the SSE spike outcome from M1.2 (PASS or fallback decision).

**M1 acceptance gate:**
- [ ] SSE spike PASSED on deployed Cloudflare Worker (or fallback documented in design doc)
- [ ] All 6 libraries land with tests: types, context-builder, tools, grounding, quota, classify, proposal-emitter
- [ ] `homeTurn` + `observerRun` orchestrators wired with injected deps
- [ ] Statelessness audit clean
- [ ] M1 PR merged into main

---

## M2 — /home chat shell (weeks 3-4)

**Goal:** Replace the existing ChatHome with the new conversational shell. SSE consumed via Route Handler. Sessions persisted. GroundingVerifier integrated end-to-end.

**Branch:** `v16-m2-home-chat` off `main`.

### Task M2.1: Branch + migration for home_sessions / home_turns

**Files:**
- Create: `apps/dashboard/supabase/migrations/0045_home_sessions_and_turns.sql`

**Step 1:** Branch: `git checkout main && git pull && git checkout -b v16-m2-home-chat`
**Step 2:** Write the migration. Follow the pattern in `apps/dashboard/supabase/migrations/0042_loop3_teammate_visibility.sql` for RLS + tenant scoping:

```sql
create table home_sessions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  started_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now(),
  archived_at timestamptz
);

alter table home_sessions enable row level security;
create policy home_sessions_tenant_iso on home_sessions
  for all using (tenant_id = current_setting('app.current_tenant_id')::uuid);

create table home_turns (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references home_sessions(id) on delete cascade,
  role text not null check (role in ('user','agent')),
  status text not null default 'completed' check (status in ('in_progress','completed','aborted','failed')),
  content_jsonb jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  finalized_at timestamptz
);

alter table home_turns enable row level security;
create policy home_turns_tenant_iso on home_turns
  for all using (
    session_id in (select id from home_sessions where tenant_id = current_setting('app.current_tenant_id')::uuid)
  );

create index home_sessions_tenant_user_idx on home_sessions(tenant_id, user_id, archived_at);
create index home_turns_session_idx on home_turns(session_id, created_at);
```

**Step 3:** Apply locally via Supabase MCP or `supabase db push`.
**Step 4:** Verify RLS via SQL: insert a session as tenant A, switch to tenant B, confirm `select * from home_sessions` returns 0 rows.
**Step 5:** Commit.

```bash
git add apps/dashboard/supabase/migrations/0045_home_sessions_and_turns.sql
git commit -m "feat(db): home_sessions + home_turns tables with RLS + status lifecycle"
```

### Task M2.2: Server-side session helpers

**Files:**
- Create: `apps/dashboard/src/lib/home/sessions.ts`
- Create: `apps/dashboard/src/lib/home/sessions.test.ts`

Test + implement: `getOrCreateActiveSession(tenantId, userId)`, `archiveSession(sessionId)`, `appendTurn(sessionId, role, content_jsonb, status)`, `finalizeTurn(turnId, content_jsonb, status)`, `getActiveSessionWithTurns(tenantId, userId, limit)`.

Use the existing `apps/dashboard/src/lib/supabase/server.ts` server client. RLS handles tenant scoping.

Commit: `feat(home): session + turn helpers with RLS-scoped queries`

### Task M2.3: Route Handler `POST /api/home/turn`

**Files:**
- Create: `apps/dashboard/src/app/api/home/turn/route.ts`
- Create: `apps/dashboard/src/app/api/home/turn/route.test.ts`

**Step 1:** Test scaffold (Vitest with mocked Anthropic + Supabase).

Tests cover: 401 if not authenticated; user turn persisted before LLM call; assistant turn lifecycle (in_progress → completed); abort sets status='aborted'; SSE event ordering (text-delta first, turn-end last).

**Step 2:** Implement.

```typescript
// route.ts
import { NextRequest } from "next/server";
import { requireActor } from "@/lib/auth/require-user";
import { homeTurn } from "@/lib/agent/home-turn";
import { ... } from "@/lib/home/sessions";

export const runtime = "edge";

export async function POST(req: NextRequest) {
  const actor = await requireActor();
  if (!actor.ok) return new Response("unauthorized", { status: 401 });
  const { sessionId, userText } = await req.json();
  // ... validate, persist user turn, allocate assistant turn id, kick off homeTurn, stream events as SSE
  // Abort: req.signal.addEventListener("abort", () => finalizeTurn(assistantTurnId, ..., "aborted"))
}
```

**Step 3:** Commit.

```bash
git commit -m "feat(api): POST /api/home/turn streams SSE; persists turn lifecycle (in_progress → completed/aborted/failed)"
```

### Task M2.4: Template cold-start greeting

**Files:**
- Create: `apps/dashboard/src/lib/home/greeting.ts`
- Create: `apps/dashboard/src/lib/home/greeting.test.ts`

Pure template, no LLM call. Inputs: `{ activeSignalCount, recentObservationCount, pendingQueueCount, workspaceName }`. Output: a one-sentence string.

Commit: `feat(home): template-driven cold-start greeting (no LLM call on page load)`

### Task M2.5: Replace ChatHome with the new conversational UI

**Files:**
- Modify: `apps/dashboard/src/components/chat-home/ChatHome.tsx` (mostly rewrite)
- Modify: `apps/dashboard/src/components/chat-home/ChatHome.test.tsx`
- Create: `apps/dashboard/src/components/chat-home/TurnView.tsx`
- Create: `apps/dashboard/src/components/chat-home/ActionCard.tsx`
- Create: `apps/dashboard/src/components/chat-home/CitationChip.tsx`

**Step 1:** Single composer (no mode toggle). State: session, turns, in-flight stream reader.
**Step 2:** SSE consumption via `fetch()` + `ReadableStream.getReader()`.
**Step 3:** AbortController on user cancel.
**Step 4:** Per-event rendering: append `text-delta` to last assistant turn; render `action-card` inline; append `citation` chips.
**Step 5:** Empty-session shows template greeting.
**Step 6:** Tests for each: stream consumption, abort, action-card click, citation chip click → /memory navigation.

Commits per sub-component:
- `feat(home): TurnView renders heterogeneous turn content`
- `feat(home): ActionCard component (navigate / draft / watch)`
- `feat(home): CitationChip linking to /memory/<id>`
- `feat(home): ChatHome consumes SSE, persists turns, handles abort`

### Task M2.6: Delete the Read/Make toggle code path

**Files:**
- Modify: `apps/dashboard/src/components/chat-home/ChatHome.tsx`
- Delete obsolete: `searchBrain` server action's UI bindings, `BrainResults` component, the toggle button

**Step 1:** Verify no other route imports the deleted components. Grep for `BrainResults`, `searchBrain`, `Read vs Make`.
**Step 2:** Delete; update imports.
**Step 3:** Run full test suite.

Commit: `refactor(home): remove Read/Make toggle path (replaced by intent-driven agent)`

### Task M2.7: M2 PR + acceptance gate

**Acceptance:**
- [ ] `/home` empty state renders template greeting (no LLM call)
- [ ] User types → SSE stream renders text + action cards + citation chips
- [ ] AbortController cancels stream cleanly; turn marked `aborted`
- [ ] Refresh mid-stream — interrupted turn shows banner
- [ ] All M2 tests pass; type-check clean; cf:build succeeds
- [ ] M2 PR merged

---

## M3 — Observer manual-run + queue-first flow + accept RPC (week 5)

**Goal:** Observer can run on demand and file a queue proposal. Accepting promotes the staged finding into `memory_files` atomically.

**Branch:** `v16-m3-observer` off `main`.

### Task M3.1: Migration for observer_signals + observer_runs

**Files:**
- Create: `apps/dashboard/supabase/migrations/0046_observer_signals_and_runs.sql`

Schema per design doc. Both tables RLS-scoped. `observer_runs` is append-only (no UPDATE policy except for the `proposals_filed` array which is updated by the emit RPC). `requested_by` is nullable to support v1.7 cron (`requested_by IS NULL AND executed_by = 'cron'`).

Commit: `feat(db): observer_signals + observer_runs with append-only runs`

### Task M3.2: PostHog adapter

**Files:**
- Create: `apps/dashboard/src/lib/integrations/posthog/adapter.ts`
- Create: `apps/dashboard/src/lib/integrations/posthog/adapter.test.ts`
- Create: `apps/dashboard/src/lib/integrations/posthog/metric-catalog.ts`

**Adapter responsibilities:**
- `listAvailableMetrics(tenantBindings)` — returns metric catalog (local; for `observer_propose`)
- `pollMetric(metricId, windowStart, windowEnd, posthogApiKey)` — fetches data via PostHog Query API
- `static`: capability class declaration (scope, retention, PII policy, baseline method, kill-switch, cost model)

Tests mock the HTTP layer. Commit: `feat(integrations): PostHog adapter implementing read-only signal class`

### Task M3.3: Anomaly detection (Z-score + min sample)

**Files:**
- Create: `apps/dashboard/src/lib/observer/anomaly.ts`
- Create: `apps/dashboard/src/lib/observer/anomaly.test.ts`

Tests: anomaly detected when |Z| ≥ threshold AND samples ≥ min; no anomaly when sample too small; missing data flag; cooldown enforced.

Commit: `feat(observer): Z-score anomaly detection with cooldown + min-sample gate`

### Task M3.4: `accept_proposal_observation()` RPC migration

**Files:**
- Create: `apps/dashboard/supabase/migrations/0047_accept_observation_proposal.sql`

**Step 1:** Read `apps/dashboard/supabase/migrations/0040_propose_change.sql` to understand the existing accept flow.
**Step 2:** Write the new RPC: atomically (in one transaction) — verify queue item exists + is type=observation + status=open + caller has operator+ role; create `memory_files` row from the staged finding in queue item body; mark queue item accepted; append operations_log entry.
**Step 3:** Write a Vitest test that exercises the RPC end-to-end via a Supabase test connection.
**Step 4:** Commit.

```bash
git commit -m "feat(db): accept_proposal_observation() RPC — atomically promotes staged finding to memory"
```

### Task M3.5: Observer run endpoint `POST /api/observer/run-now/:signalId`

**Files:**
- Create: `apps/dashboard/src/app/api/observer/run-now/[signalId]/route.ts`
- Create: matching test file

Auth: `requireRole(actor, "operator")`. Verify signal belongs to actor tenant + enabled. Calls `observerRun()` from M1. Logs both `requested_by` (actor id) and `executed_by` ('user' for v1.6, will be 'cron' in v1.7).

Commit: `feat(api): POST /api/observer/run-now/:id with operator+ gate + ownership check`

### Task M3.6: Queue UI — "How BBC found this" section for observation proposals

**Files:**
- Modify: `apps/dashboard/src/app/queue/[id]/page.tsx`

When the queue item's frontmatter `type === 'observation'`, render the additional section: signal source + metric name, anomaly summary (delta, baseline, window), the run ID linking to the observer_runs trace (admin only), and citation chips from the staged finding.

Commit: `feat(queue): render 'How BBC found this' for observation proposals`

### Task M3.7: M3 PR + acceptance gate

**Acceptance:**
- [ ] Migrations apply cleanly; RLS tests pass
- [ ] Observer detects a synthetic anomaly in a test fixture
- [ ] `POST /api/observer/run-now/:id` files a queue item visible in /queue
- [ ] `accept_proposal_observation()` promotes the staged finding to memory atomically (assert via SQL test)
- [ ] Reject path leaves no memory_files row
- [ ] M3 PR merged

---

## M4 — /settings/observers UI + three-step consent + atomic quota RPC (week 6)

**Branch:** `v16-m4-settings-quotas` off `main`.

### Task M4.1: Migration for tenant_quotas + RPCs

**Files:**
- Create: `apps/dashboard/supabase/migrations/0048_tenant_quotas.sql`

Schema per design. RPCs:
- `reserve_quota(tenant_id, actor_id, estimated_tokens, kind) RETURNS jsonb` — atomic row lock, increments counter under SELECT FOR UPDATE, returns `{ok, reservation_id}` or `{ok:false, reason}`.
- `reconcile_quota(reservation_id, actual_tokens) RETURNS jsonb` — adjusts the count post-call.

Tests: concurrent reservations don't overspend (run 100 parallel reserves against a budget of 10).

Commit: `feat(db): tenant_quotas + atomic reserve_quota/reconcile_quota RPCs`

### Task M4.2: Wire quota RPCs into homeTurn + observerRun

**Files:**
- Modify: `apps/dashboard/src/lib/agent/home-turn.ts` (replace TS stub with real RPC call)
- Modify: `apps/dashboard/src/lib/agent/observer-run.ts` (same)

Commit: `feat(agent): wire reserve_quota/reconcile_quota into both orchestration paths`

### Task M4.3: `/settings/observers` page

**Files:**
- Create: `apps/dashboard/src/app/settings/observers/page.tsx`
- Create: `apps/dashboard/src/app/settings/observers/[signalId]/runs/page.tsx`
- Create: `apps/dashboard/src/app/settings/observers/actions.ts`

Page lists user's enabled + disabled signals with: metric name, last run, current state, kill-switch toggle, "Run check now" button (calls M3 endpoint), "View runs" link to audit log.

Server actions: `enableSignal(signalId)`, `disableSignal(signalId)`, `deleteSignal(signalId)` — all gated by `requireRole(operator)` and tenant ownership.

Commit: `feat(settings): /settings/observers page with per-signal kill-switch + audit log`

### Task M4.4: Three-step consent flow (UI side)

**Files:**
- Modify: `apps/dashboard/src/components/chat-home/ActionCard.tsx` (handle new `kind: "watch-proposal"` cards)
- Create: `apps/dashboard/src/app/api/observer/signals/setup/route.ts` (POST, creates disabled row + first PostHog validation)
- Modify: `/settings/observers` to expose Enable buttons

Flow:
1. Agent returns `[Set up this watch →]` action card with preview spec
2. Click → POST to setup endpoint → row created `enabled=false`; PostHog validated; on success, card swaps to `[Enable watching →]`
3. Click Enable → updates row to `enabled=true`; signal joins the watching strip on /home

Test the full handoff. Commit: `feat(observer): three-step consent (propose → set up → enable) with PostHog validation at setup`

### Task M4.5: "Watching" strip on /home

**Files:**
- Modify: `apps/dashboard/src/components/chat-home/ChatHome.tsx`

Persistent top strip showing enabled signals as chips. Click → opens a focused conversation about that metric (just types `tell me about my <metric> watch` into the composer).

Commit: `feat(home): watching strip surfaces enabled signals at top of /home`

### Task M4.6: M4 PR + acceptance gate

**Acceptance:**
- [ ] Quota RPC concurrent test passes (100-parallel-reserve test)
- [ ] /settings/observers renders all CRUD operations
- [ ] Three-step consent flow works end-to-end (no PostHog calls before step 2)
- [ ] Watching strip on /home updates when a signal is enabled
- [ ] Quota exhaustion gracefully degrades chat + skips observer runs
- [ ] M4 PR merged

---

## M5 — Polish + second codex review + Cloudflare deploy (week 7)

**Branch:** `v16-m5-polish` off `main`.

### Task M5.1: End-to-end demo flow

**Step 1:** Manually execute the 8-step success criteria from the design doc.
**Step 2:** Record findings as test scenarios; turn failures into fixes.
**Step 3:** Commit any fixes.

### Task M5.2: Codex review on the full v1.6 diff

**Step 1:** Run `/codex review --base main` from the integration branch (squash-merged previous milestones onto a single review branch first if needed).
**Step 2:** Address all `[P1]` findings before continuing. `[P2]` findings — fix or document deferral.

### Task M5.3: Voice review pass

**Step 1:** Generate 20 sample agent replies covering each intent. Compare against `memory/design/voice-tone.md`.
**Step 2:** Iterate prompt or GroundingVerifier wording until samples match voice.
**Step 3:** Commit prompt updates.

### Task M5.4: Mobile QA (the <860px burger menu regression)

**Step 1:** Open /home on mobile viewport (Chrome DevTools 375px).
**Step 2:** Verify ChatHome composer + watching strip don't overflow.
**Step 3:** Fix the AppNav burger menu (the regression flagged from Phase P).
**Step 4:** Commit.

### Task M5.5: Cloudflare deploy

**Step 1:** Ensure `wrangler.toml` has all required env vars (especially the PostHog adapter's API key vault binding).
**Step 2:** `pnpm --filter @bbc/dashboard cf:build && pnpm --filter @bbc/dashboard cf:deploy --env preview`.
**Step 3:** Smoke-test the preview URL with the same 8-step demo flow.
**Step 4:** Promote to production.

### Task M5.6: Release notes + memory handoff

**Files:**
- Create: `docs/releases/v1.6.md`
- Update memory: write a v1.6-shipped entry to user memory.

### M5 acceptance gate (v1.6 ship gate):

- [ ] 8-step demo flow passes for a fresh tenant
- [ ] Codex review GATE: PASS (no [P1] findings open)
- [ ] Voice review pass clean
- [ ] Mobile UX verified at 375px / 768px / 1024px
- [ ] Production deploy live
- [ ] Release notes published

---

## PLAN.md acceptance criteria checklist (codex partial-fixes folded in)

These were carried from design doc's "PLAN.md acceptance criteria" section. Verify before opening any milestone's PR:

- [ ] **Per-table mutation policy** documented in M0.4 — `home_sessions`, `home_turns`, `observer_signals`, `observer_runs`, `tenant_quotas`. Each has RLS SQL, retention, mutable/append-only fields, RPC ownership, cascade behavior, test cases.
- [ ] **`accept_proposal_observation()` RPC migration** lands in M3.4 with SQL + Vitest end-to-end test.
- [ ] **`reserve_quota` / `reconcile_quota` RPCs** land in M4.1 with concurrent-load test (100 parallel reserves).
- [ ] **`requireActor` inside long-lived Route Handler** verified during M2.3 — cookie session refresh behavior under streaming documented.
- [ ] **Internal write tool audit shape** — `observation_emit` uses `(signal_id, window_start)` idempotency key; chat-driven `proposal_emit` uses `(session_id, turn_id)`. Both write `operations_log` entries on emit.
- [ ] **GroundingVerifier claim-parser** implemented in M1.6; initial regex over `[mem:<id>]`. Voice review at M5 tightens it.
- [ ] **Library statelessness contract** audited in M1.12.
- [ ] **`proposal_frontmatter.observer_run_id`** wired through ProposalEmitter (M1.9) and rendered in queue detail (M3.6).

---

## Known follow-ups (out of v1.6 scope, capture in memory)

- Cloudflare Cron Triggers + per-tenant scheduling lease (v1.7)
- Anomaly model: matched-windows, seasonality, drift, anomaly classes (v1.7)
- Additional signal adapters: Linear, GitHub, Gmail (v1.7+)
- Durable tool execution envelope for browser-use et al. (v1.7)
- Hermes-agent integration spike (v1.8+)
- File upload / pasted screenshot in chat (v1.7)
- Per-tenant LLM cost display UI (v1.7 — surface in /settings/keys or new /settings/usage)
