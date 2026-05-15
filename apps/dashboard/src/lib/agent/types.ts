// v1.6 agent type contract.
//
// Two orchestration paths consume these: homeTurn() (sync, user-auth, SSE
// streamed) and observerRun() (async, service-actor, idempotent). Both
// build an `AgentContext` from the same shape; the discriminated `buffer`
// union expresses whether the turn carries conversation state or anomaly
// state.

export type Role = "admin" | "operator" | "member" | "viewer";

export type ConversationTurn = {
  role: "user" | "agent";
  text: string;
  /**
   * Memory IDs the LLM cited in this turn. For agent turns only.
   * For user turns, leave undefined.
   */
  citations?: string[];
};

export type AnomalyContext = {
  /**
   * Capability-class + implementation key (e.g. `posthog.metric`).
   * v1.6 ships exactly one: `posthog.metric`.
   */
  signalType: "posthog.metric";
  signalId: string;
  metricName: string;
  /**
   * Observed change vs baseline. Signed; can be a ratio (0.12 = 12% up)
   * or an absolute number depending on `delta_units` semantics declared by
   * the adapter.
   */
  delta: number;
  /**
   * Adapter-supplied snapshot of the current + baseline windows that
   * produced the anomaly. Opaque to the agent; passed through into
   * `observer_runs.window_snapshot` for audit.
   */
  windowSnapshot: unknown;
};

/**
 * The fully-assembled context handed to an LLM call. Built by
 * `AgentContextBuilder.buildAgentContext()`. Statelessly composable —
 * no module state, no top-level side effects (see STATELESSNESS.md).
 */
export type AgentContext = {
  tenantId: string;
  /**
   * Authenticated user id for `homeTurn`; null for `observerRun` (service
   * actor identity per ADR-0009 v1.6 amendment).
   */
  actorId: string | null;
  role: Role;
  rolePack: {
    /**
     * Voice description from the tenant's `voice` memory, summarized for
     * prompt embedding. Source: `memory/design/voice-tone.md` (canonical).
     */
    voice: string;
    vendors: string[];
    decisions: Array<{ id: string; title: string }>;
    glossary: Record<string, string>;
  };
  buffer:
    | {
        kind: "conversation";
        turns: ConversationTurn[];
        userInput: string;
      }
    | {
        kind: "anomaly";
        anomaly: AnomalyContext;
      };
  /**
   * Lightweight always-on context. NOT the entire memory index — just a
   * trimmed excerpt the agent always sees, plus the workspace name for
   * voice grounding.
   */
  alwaysOn: {
    memoryIndexExcerpt: string;
    workspaceName: string;
  };
};

/**
 * Conversational intents — the 6 values `classifyIntent()` is allowed to
 * return. Narrower than `Intent` because `observe-anomaly` is reserved
 * for the observer path and must not be selectable by the chat-side
 * classifier (otherwise the chat path could enable observation_emit
 * by mistake — codex M1 review P1 #1).
 */
export type ConversationalIntent =
  | "navigate"
  | "explain"
  | "draft"
  | "watch"
  | "meta"
  | "unclear";

/**
 * The full intent vocabulary. `observe-anomaly` is the fixed intent for
 * the async observer path — `observerRun` skips the classifier and uses
 * it directly via `toolsForIntent`.
 */
export type Intent = ConversationalIntent | "observe-anomaly";
