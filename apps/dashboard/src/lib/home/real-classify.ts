import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import type { ClassifierLlm } from "@/lib/agent/classify";
import type { Intent } from "@/lib/agent/types";

const CLASSIFIER_MODEL = "claude-haiku-4-5-20251001";
const MAX_TOKENS = 100;

const INTENT_TOOL = {
  name: "set_intent" as const,
  description:
    "Set the conversational intent for the user's latest message.",
  input_schema: {
    type: "object" as const,
    properties: {
      intent: {
        type: "string",
        enum: ["navigate", "explain", "draft", "meta", "unclear"],
      },
    },
    required: ["intent"],
  },
};

const SYSTEM_PROMPT = `You classify a user's chat message into exactly one of: navigate, explain, draft, meta, unclear.

navigate — the user wants to GO somewhere ("open settings", "take me to memory", "where is X").
explain — the user is asking a question they want answered from their own memory ("what's our voice?", "who's on the team", "did we decide on X").
draft — the user wants to GENERATE content ("draft a board update", "write a tweet about Y", "compose a memo for Z").
meta — the user is asking about the system, account, billing, quotas, OR they want to set up monitoring/watching/alerts (which isn't fully shipped yet, so meta is the right bucket).
unclear — the message is too short or ambiguous to classify.

Reply via the set_intent tool only. Do not emit any text.`;

export function makeRealClassify(client: Anthropic): ClassifierLlm {
  return async ({ text, recent }) => {
    const history = recent.slice(-2).map((t) => ({
      role: t.role === "user" ? ("user" as const) : ("assistant" as const),
      content: t.text,
    }));
    const messages = [
      ...history,
      { role: "user" as const, content: text },
    ];
    const resp = await client.messages.create({
      model: CLASSIFIER_MODEL,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      tools: [INTENT_TOOL],
      tool_choice: { type: "tool", name: INTENT_TOOL.name },
      messages,
    });
    const toolUse = resp.content.find((c) => c.type === "tool_use");
    if (!toolUse || toolUse.type !== "tool_use") {
      return { intent: "unclear" as Intent };
    }
    const input = toolUse.input as { intent?: string };
    return { intent: (input.intent ?? "unclear") as Intent };
  };
}
