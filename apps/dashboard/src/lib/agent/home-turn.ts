// homeTurn — the synchronous, user-authenticated, SSE-streamed
// orchestration path for /home conversation. Composes QuotaGate +
// ContextBuilder + classifyIntent + tool registry + injected LLM +
// GroundingVerifier into a typed SSE event stream.
//
// Stateless: every dependency is injected. The function never imports
// a Supabase or Anthropic client directly. The caller (the Route Handler
// at /api/home/turn — M2.3) wires the real deps; tests wire vi mocks.

import type {
  AgentContext,
  ConversationalIntent,
  ConversationTurn,
  Role,
} from "./types";
import { verifyGrounding } from "./grounding";
import { toolsForIntent } from "./tools";

// ────────────────────────────────────────────────────────────────────
// Public types
// ────────────────────────────────────────────────────────────────────

export type HomeTurnArgs = {
  tenantId: string;
  actorId: string;
  role: Role;
  userInput: string;
  recent: ConversationTurn[];
};

export type LlmToolCall = {
  name: string;
  input: unknown;
  output: unknown;
};

export type LlmResult = {
  text: string;
  toolCalls: LlmToolCall[];
  tokens: number;
  /**
   * Optional. Memory IDs the LLM saw via tool calls during this turn —
   * merged into the static `retrievedMemoryIds` allowlist before grounding
   * verification. Without this, a tool-discovered row's citation would be
   * stripped because the static allowlist was set before homeTurn ran.
   */
  extraGroundedIds?: readonly string[];
  /**
   * Optional. Titles for memory IDs the LLM saw via tool calls — keyed
   * by id. Merged with the static `memoryTitles` dep before emitting
   * citation events. Without this, a tool-discovered row's chip would
   * show its raw uuid even when the search result included a title.
   */
  extraGroundedTitles?: Readonly<Record<string, string>>;
  /**
   * Optional. Types for memory IDs the LLM saw via tool calls — keyed
   * by id. Merged with the static `memoryTypes` dep so the citation
   * chip can render with per-type color (v1.8+). Without this, a
   * tool-discovered chip falls back to the neutral tint.
   */
  extraGroundedTypes?: Readonly<Record<string, string>>;
};

export type BuildContextFn = (input: {
  tenantId: string;
  actorId: string;
  role: Role;
  userInput: string;
  recent: ConversationTurn[];
}) => Promise<AgentContext>;

/**
 * Returns one of the 6 conversational intents. Higher-level than the raw
 * `ClassifierLlm` — this is the post-fallback shape. The Route Handler
 * binds: `(input) => classifyIntent(input.text, input.recent, llm)`.
 *
 * Type-narrowing to `ConversationalIntent` (vs full `Intent`) prevents
 * the chat path from accidentally receiving `observe-anomaly` and
 * enabling `observation_emit` (codex M1 review P1 #1).
 */
export type ClassifyFn = (input: {
  text: string;
  recent: ConversationTurn[];
}) => Promise<ConversationalIntent>;

export type InvokeLlmFn = (input: {
  ctx: AgentContext;
  intent: ConversationalIntent;
  toolNames: readonly string[];
  /**
   * Optional. Called with each incremental text chunk as the LLM streams.
   * When provided, the implementation SHOULD use a streaming completion so
   * the user sees text appear live instead of waiting 4-12s for the whole
   * response. When omitted (e.g. in tests), implementations may fall back
   * to non-streaming. Implementations MUST still return the full
   * accumulated text in `LlmResult.text` regardless of whether they
   * streamed — grounding verification runs on that.
   */
  onTextDelta?: (delta: string) => void;
}) => Promise<LlmResult>;

export type HomeTurnDeps = {
  reserveQuota: (args: {
    tenantId: string;
    actorId: string | null;
    estimatedTokens: number;
    kind: "home_turn" | "observer_run";
  }) => Promise<
    | { ok: true; reservationId: string }
    | { ok: false; reason: string }
  >;
  reconcileQuota: (args: {
    reservation_id: string;
    actual_tokens: number;
  }) => Promise<{ ok: boolean }>;
  buildContext: BuildContextFn;
  classify: ClassifyFn;
  invokeLlm: InvokeLlmFn;
  /** Memory IDs the LLM is permitted to cite this turn. */
  retrievedMemoryIds: readonly string[];
  /**
   * Titles for the retrieved memory IDs, keyed by id. Used to populate
   * the optional `title` on citation SSE events so chips render with the
   * row title instead of a uuid prefix. Tool-discovered rows can supply
   * titles too via LlmResult.extraGroundedTitles.
   */
  memoryTitles?: Readonly<Record<string, string>>;
  /**
   * Types for the retrieved memory IDs, keyed by id (v1.8+). Used to
   * populate the optional `type` on citation SSE events so the chip can
   * render with per-type color (decision = blue, voice = pink, etc.).
   * Tool-discovered rows can supply types too via
   * LlmResult.extraGroundedTypes.
   */
  memoryTypes?: Readonly<Record<string, string>>;
};

export type SseEvent =
  | { event: "text-delta"; data: { delta: string } }
  /**
   * Replaces the current turn's text wholesale. Emitted after streaming
   * completes when grounding verification stripped or appended content.
   * The UI swaps the streamed text for the corrected text.
   */
  | { event: "text-replace"; data: { text: string } }
  | {
      event: "action-card";
      data: { kind: string; payload: unknown };
    }
  | {
      event: "citation";
      data: { memoryId: string; title?: string | null; type?: string | null };
    }
  /**
   * Emitted by the route as the very first SSE event when a brand-new
   * session was created for this turn. Carries the new sessionId so the
   * client can update its URL (?session=<id>) without re-fetching the
   * rail, plus the derived title for the rail row. Not emitted on
   * turns that target an existing session.
   */
  | {
      event: "session-created";
      data: { sessionId: string; title: string };
    }
  | {
      event: "turn-end";
      data: {
        status: "completed" | "aborted" | "failed";
        error?: string;
        /**
         * The session's `last_activity_at` after this turn completed.
         * Populated by the route after homeTurn finishes so the client
         * rail can update the recency timestamp without a separate
         * round-trip.
         */
        lastActivityAt?: string;
      };
    };

export type Emit = (e: SseEvent) => void;

// ────────────────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────────────────

const ESTIMATED_TOKENS_PER_TURN = 1500;

const BUDGET_EXHAUSTED_COPY =
  "Your tenant has used its tokens for today. Try again tomorrow — or raise the limit at /settings/quotas.";

// ────────────────────────────────────────────────────────────────────
// Orchestrator
// ────────────────────────────────────────────────────────────────────

export async function homeTurn(
  args: HomeTurnArgs,
  deps: HomeTurnDeps,
  emit: Emit,
): Promise<void> {
  // 1) Quota gate — refuse before any other work if the budget is gone.
  const reservation = await deps.reserveQuota({
    tenantId: args.tenantId,
    actorId: args.actorId,
    estimatedTokens: ESTIMATED_TOKENS_PER_TURN,
    kind: "home_turn",
  });
  if (!reservation.ok) {
    emit({
      event: "text-delta",
      data: { delta: BUDGET_EXHAUSTED_COPY },
    });
    emit({
      event: "turn-end",
      data: { status: "failed", error: reservation.reason },
    });
    return;
  }

  let actualTokens = 0;

  try {
    // 2) Assemble context.
    const ctx = await deps.buildContext({
      tenantId: args.tenantId,
      actorId: args.actorId,
      role: args.role,
      userInput: args.userInput,
      recent: args.recent,
    });

    // 3) Classify intent. ClassifyFn already applies the unclear-fallback
    // and narrows to ConversationalIntent, so we cannot receive
    // 'observe-anomaly' here even if the underlying LLM is malicious.
    const intent = await deps.classify({
      text: args.userInput,
      recent: args.recent,
    });

    // 4) Pick tool subset for the intent.
    const tools = toolsForIntent(intent);
    const toolNames = tools.map((t) => t.name);

    // 5) Invoke LLM. Pipe text deltas live to SSE as the model streams.
    // The user sees text appear incrementally instead of waiting 4-12s
    // for the full completion. We accumulate every streamed delta so
    // step 7 can compare what the UI received against the grounded
    // final text — this matters because tool_use iterations can stream
    // preamble prose ("Let me look that up...") that LlmResult.text
    // does not carry, so the grounded comparison must be made against
    // the wider stream, not just the final iteration.
    let streamedText = "";
    const llm = await deps.invokeLlm({
      ctx,
      intent,
      toolNames,
      onTextDelta: (delta) => {
        if (delta.length === 0) return;
        streamedText += delta;
        emit({ event: "text-delta", data: { delta } });
      },
    });
    actualTokens = llm.tokens;

    // 6) Verify grounding. Strips ungrounded sentences, appends fallback.
    // Merge tool-discovered IDs into the static allowlist — tools can
    // surface rows the static retrieval missed (older rows, model-chosen
    // search terms) and their citations should be honored.
    const groundedIds = llm.extraGroundedIds && llm.extraGroundedIds.length > 0
      ? [...deps.retrievedMemoryIds, ...llm.extraGroundedIds]
      : deps.retrievedMemoryIds;
    const grounded = verifyGrounding(llm.text, groundedIds);

    // 7) Emit. If we streamed deltas live and the UI's accumulated text
    // already matches the grounded final text, nothing more to emit.
    // Otherwise emit text-replace so the UI swaps the streamed body for
    // the grounded one — this covers both grounding strips and the
    // preamble-from-tool-iterations case where streamed text is wider
    // than the grounded final answer. If nothing streamed (no callback
    // path, e.g. test mocks), fall back to one text-delta carrying the
    // grounded text — same contract as before streaming existed.
    if (streamedText.length > 0) {
      if (streamedText !== grounded.text) {
        emit({ event: "text-replace", data: { text: grounded.text } });
      }
    } else if (grounded.text.length > 0) {
      emit({ event: "text-delta", data: { delta: grounded.text } });
    }

    for (const call of llm.toolCalls) {
      emit({
        event: "action-card",
        data: { kind: call.name, payload: call.output },
      });
    }

    // Merge static + tool-discovered title/type maps. Tool-discovered
    // values win on conflict because they reflect a fresh memory_fetch
    // read.
    const titleMap: Record<string, string> = {
      ...(deps.memoryTitles ?? {}),
      ...(llm.extraGroundedTitles ?? {}),
    };
    const typeMap: Record<string, string> = {
      ...(deps.memoryTypes ?? {}),
      ...(llm.extraGroundedTypes ?? {}),
    };
    for (const id of grounded.citations) {
      const title = titleMap[id];
      const type = typeMap[id];
      emit({
        event: "citation",
        data: {
          memoryId: id,
          title: title ?? null,
          type: type ?? null,
        },
      });
    }

    emit({
      event: "turn-end",
      data: { status: "completed" },
    });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    emit({
      event: "text-delta",
      data: {
        delta:
          "Something went wrong on my side. Try again in a moment — the trace is logged.",
      },
    });
    emit({
      event: "turn-end",
      data: { status: "failed", error: errMsg },
    });
  } finally {
    // Always reconcile to free the reservation. Even on LLM error we
    // assume actual = estimated as the worst-case (consistent with the
    // lazy-cleanup policy inside reserve_quota — see migration policy).
    //
    // Guarded with try/catch so a reconcile failure does not poison the
    // user-facing terminal event (codex M1 review P2 #5). Orphan
    // reservations are reaped by the next reserve_quota call's lazy
    // cleanup after 5 minutes (M0 migration policy).
    try {
      await deps.reconcileQuota({
        reservation_id: reservation.reservationId,
        actual_tokens: actualTokens || ESTIMATED_TOKENS_PER_TURN,
      });
    } catch (reconcileErr) {
      void reconcileErr;
    }
  }
}
