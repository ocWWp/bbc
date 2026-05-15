// classifyIntent — Haiku-tier pre-classifier for the conversation path.
//
// Per the v1.6 design doc: a dedicated cheap model call over the latest
// user input + last 2 turns produces one of 6 conversational intents
// (navigate, explain, draft, watch, meta, unclear). The observer path
// skips classification entirely — observerRun() passes 'observe-anomaly'
// directly.
//
// Cost target: ~$0.0001/turn at Haiku rates (5-7M input tokens per $1).
//
// Stateless: caller injects the LLM. We never import the Anthropic SDK
// here; the dependency lives at the orchestrator layer where binding
// resolution + provider routing happen.

import type { ConversationTurn, Intent } from "./types";

const CONVERSATIONAL_INTENTS = new Set<Intent>([
  "navigate",
  "explain",
  "draft",
  "watch",
  "meta",
  "unclear",
]);

export type ClassifierLlm = (input: {
  text: string;
  recent: ConversationTurn[];
}) => Promise<{ intent: Intent }>;

/**
 * Classify the user's intent. Returns `unclear` on any failure path:
 *   - LLM rejects (network, rate limit, timeout)
 *   - LLM returns a value outside the 6-intent vocabulary
 *   - LLM returns 'observe-anomaly' (reserved for the observer path)
 *
 * The fallback is deliberately conservative: when the model fails or
 * misbehaves, the orchestrator should fall through to a tool-less reply
 * asking the user for clarification, not silently pick a default intent.
 */
export async function classifyIntent(
  text: string,
  recent: readonly ConversationTurn[],
  llm: ClassifierLlm,
): Promise<Intent> {
  try {
    const r = await llm({
      text,
      recent: recent.slice(-2) as ConversationTurn[],
    });
    if (!CONVERSATIONAL_INTENTS.has(r.intent)) {
      return "unclear";
    }
    return r.intent;
  } catch {
    return "unclear";
  }
}
