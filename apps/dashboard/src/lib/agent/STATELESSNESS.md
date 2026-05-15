# `lib/agent/` statelessness audit (M1.12)

**Contract.** Every module under `apps/dashboard/src/lib/agent/`:

1. Has **no module-level mutable state.** No top-level `let foo: Foo[] = []` collecting state across calls.
2. Has **no top-level side effects.** No `console.log` at import, no Supabase client construction at module scope, no auto-registration imports.
3. Has **every external dependency injected.** No direct imports of `@supabase/*`, `@anthropic-ai/sdk`, `posthog-node`, or any HTTP client. The orchestrator's caller wires real clients; tests wire `vi.fn()` mocks.

Rationale: same library set runs in two paths (`homeTurn` — sync, cookie-auth, latency-sensitive; `observerRun` — async, service-actor, idempotent, audit-heavy). Hidden module state would couple them; hidden side effects would surface differently under streaming vs background execution. Injection keeps both paths trivially testable.

This audit is the **M1.12 acceptance gate**. Any future addition to `lib/agent/` must update this table before merging.

## Audit table

| File | Module-level mutable state | Top-level side effects | DB/LLM imports |
|---|---|---|---|
| `index.ts` | None (re-exports only) | None | None |
| `types.ts` | None (type-only) | None | None |
| `context-builder.ts` | None | None | `ContextDb` injected via `args.db` |
| `tools.ts` | `TOOLS` (`readonly`) + `BY_INTENT` — both immutable, no mutation paths exposed | None | None |
| `grounding.ts` | `MEM_MARKER` regex + `FALLBACK` string — immutable | None | None |
| `quota.ts` | None | None | `ReserveRpc` and `ReconcileRpc` injected as args |
| `classify.ts` | `CONVERSATIONAL_INTENTS` Set — immutable, never `.add`'d | None | `ClassifierLlm` injected |
| `proposal-emitter.ts` | None | None | `ProposeObservationRpc` injected |
| `home-turn.ts` | `ESTIMATED_TOKENS_PER_TURN` + `BUDGET_EXHAUSTED_COPY` — primitive constants | None | All deps via `HomeTurnDeps` |
| `observer-run.ts` | `ESTIMATED_TOKENS_PER_RUN` — primitive constant | None | All deps via `ObserverRunDeps` |

## Constants vs state

A `const` at module scope is fine. A `const` declaring an array or object that the module then mutates is not — that would be module state in a const wrapper. The audit verified there are no such cases today.

Notable constants worth specific attention:

- `tools.ts: TOOLS` is `readonly ToolDef[]`. `toolsForIntent` calls `TOOLS.filter(...)` which returns a new array; the source is never mutated.
- `grounding.ts: MEM_MARKER` is a `RegExp` literal with the `g` flag. The `g` flag introduces shared `lastIndex` state on the regex object when `.exec()` is used. `verifyGrounding` uses `[...text.matchAll(MEM_MARKER)]` exclusively, which is a fresh iteration per call and does not touch `lastIndex`. **This is the one non-obvious safety property in the library** — if a future change introduces `MEM_MARKER.exec(...)` instead, concurrent calls could interfere.
- `classify.ts: CONVERSATIONAL_INTENTS` is a `Set` constructed once at module load. No `.add` or `.delete` calls anywhere.

## What this means for callers

The orchestrator's caller (the M2 `POST /api/home/turn` Route Handler, the M3 `POST /api/observer/run-now/:id` Route Handler) is responsible for:

- Constructing the Supabase client bound to the request's auth context.
- Resolving the LLM provider per binding (M4 work — for now, both paths inject Anthropic directly).
- Implementing `pollSignal` against the right adapter (PostHog in M3.2, others in v1.7).
- Implementing `detectAnomaly` — Z-score lands in M3.3; richer methods in v1.7.
- Wiring `reserveQuota` / `reconcileQuota` to the M4 SQL RPCs.

Library code stays pure: same functions, different injected deps for the two orchestration paths.

## Parallel-call safety

Two `homeTurn` invocations executing concurrently against different tenants must not interfere. The current design guarantees this by construction — there's no shared mutable state for them to interleave on. A regression test asserting this is overkill given the audit, but if a regression is ever suspected: invoke two `homeTurn`s with `Promise.all([...])` against different `tenantId` args and assert each gets its own SSE event sequence with its own tenant's data.

---

If this audit becomes stale (a new file lands in `lib/agent/` without a row added here), the M1 acceptance gate is broken. Treat that as a blocker.
