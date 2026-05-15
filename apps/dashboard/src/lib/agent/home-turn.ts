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
  ConversationTurn,
  Intent,
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
};

export type BuildContextFn = (input: {
  tenantId: string;
  actorId: string;
  role: Role;
  userInput: string;
  recent: ConversationTurn[];
}) => Promise<AgentContext>;

export type ClassifyFn = (input: {
  text: string;
  recent: ConversationTurn[];
}) => Promise<{ intent: Intent }>;

export type InvokeLlmFn = (input: {
  ctx: AgentContext;
  intent: Intent;
  toolNames: readonly string[];
}) => Promise<LlmResult>;

export type HomeTurnDeps = {
  reserveQuota: (args: {
    tenantId: string;
    actorId: string | null;
    estimatedTokens: number;
    kind: "home_turn" | "observer_run";
  }) =>
    | Promise<{ ok: true; reservationId: string }>
    | Promise<{ ok: false; reason: string }>;
  reconcileQuota: (args: {
    reservation_id: string;
    actual_tokens: number;
  }) => Promise<{ ok: boolean }>;
  buildContext: BuildContextFn;
  classify: ClassifyFn;
  invokeLlm: InvokeLlmFn;
  /** Memory IDs the LLM is permitted to cite this turn. */
  retrievedMemoryIds: readonly string[];
};

export type SseEvent =
  | { event: "text-delta"; data: { delta: string } }
  | {
      event: "action-card";
      data: { kind: string; payload: unknown };
    }
  | {
      event: "citation";
      data: { memoryId: string };
    }
  | {
      event: "turn-end";
      data: {
        status: "completed" | "aborted" | "failed";
        error?: string;
      };
    };

export type Emit = (e: SseEvent) => void;

// ────────────────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────────────────

const ESTIMATED_TOKENS_PER_TURN = 1500;

const BUDGET_EXHAUSTED_COPY =
  "Your tenant has used its tokens for today. Try again tomorrow — or raise the limit in settings.";

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

    // 3) Classify intent.
    const classified = await deps.classify({
      text: args.userInput,
      recent: args.recent,
    });
    const intent = classified.intent;

    // 4) Pick tool subset for the intent.
    const tools = toolsForIntent(intent);
    const toolNames = tools.map((t) => t.name);

    // 5) Invoke LLM.
    const llm = await deps.invokeLlm({ ctx, intent, toolNames });
    actualTokens = llm.tokens;

    // 6) Verify grounding. Strips ungrounded sentences, appends fallback.
    const grounded = verifyGrounding(llm.text, deps.retrievedMemoryIds);

    // 7) Emit. text-delta first (so the user sees text), then tool result
    // cards, then citation chips, then turn-end.
    if (grounded.text.length > 0) {
      emit({
        event: "text-delta",
        data: { delta: grounded.text },
      });
    }

    for (const call of llm.toolCalls) {
      emit({
        event: "action-card",
        data: { kind: call.name, payload: call.output },
      });
    }

    for (const id of grounded.citations) {
      emit({
        event: "citation",
        data: { memoryId: id },
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
    await deps.reconcileQuota({
      reservation_id: reservation.reservationId,
      actual_tokens: actualTokens || ESTIMATED_TOKENS_PER_TURN,
    });
  }
}
