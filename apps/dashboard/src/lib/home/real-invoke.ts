import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import type { InvokeLlmFn, LlmToolCall, LlmResult } from "@/lib/agent/home-turn";
import type { AgentContext, ConversationalIntent } from "@/lib/agent/types";
import { TOOLS, toolsForIntent } from "@/lib/agent/tools";
import { listStudioMenu, type HomeToolExecutor } from "./tool-impls";

const RUN_MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 2048;
const MAX_TOOL_ITERATIONS = 5;

/**
 * Build the system prompt. Memory is presented as an index (TOC of mem ids
 * with titles), not as inlined content — the LLM is expected to call
 * memory_search and memory_fetch when it wants details. Citations use the
 * inline `[mem:<uuid>]` format that the grounding verifier already parses.
 */
function buildSystemPrompt(
  ctx: AgentContext,
  intent: ConversationalIntent,
): string {
  const sections: string[] = [];

  sections.push(
    `You are BBC's home assistant for the "${ctx.alwaysOn.workspaceName}" workspace.`,
    `Answer the user grounded in their memory. When you cite a memory row, use the inline format [mem:<uuid>] so the citation is verifiable. Do not fabricate uuids.`,
  );

  if (ctx.rolePack.voice) {
    sections.push(`Workspace voice — ${ctx.rolePack.voice}`);
  }

  if (ctx.rolePack.vendors.length > 0) {
    sections.push(`Known vendors: ${ctx.rolePack.vendors.join(", ")}.`);
  }

  if (ctx.rolePack.decisions.length > 0) {
    const lines = ctx.rolePack.decisions
      .map((d) => `- ${d.title} [mem:${d.id}]`)
      .join("\n");
    sections.push(`Recent decisions:\n${lines}`);
  }

  const glossaryKeys = Object.keys(ctx.rolePack.glossary);
  if (glossaryKeys.length > 0) {
    const lines = glossaryKeys
      .map((k) => `- ${k}: ${ctx.rolePack.glossary[k]}`)
      .join("\n");
    sections.push(`Glossary:\n${lines}`);
  }

  if (ctx.alwaysOn.memoryIndexExcerpt) {
    sections.push(
      `Memory index (recent + relevant rows you may cite):\n${ctx.alwaysOn.memoryIndexExcerpt}`,
    );
  }

  // Intent-specific framing.
  switch (intent) {
    case "explain":
      sections.push(
        `The user is asking a question about their workspace. Call memory_search to find the right rows, then memory_fetch to read content when needed. Reply with a direct answer that cites supporting rows with [mem:<uuid>]. If memory does not cover the question, say so plainly rather than inventing facts.`,
      );
      break;
    case "navigate":
      sections.push(
        `The user wants to navigate somewhere in the app. Call the route_match tool with the navigation phrase (e.g. "queue", "marketing studio", "api keys"). If route_match returns a non-null route, reply with one short sentence naming the destination — the UI will render a clickable card from the tool result. If it returns route:null, say plainly that you don't know where that lives.`,
      );
      break;
    case "draft": {
      const menu = listStudioMenu()
        .map(
          (r) =>
            `- ${r.roleLabel} (role=${r.role}): ${r.templates
              .map((t) => `${t.id} → ${t.label}`)
              .join("; ")}`,
        )
        .join("\n");
      sections.push(
        `The user wants you to draft content. Studios own the heavyweight drafting flow; your job is to route precisely. Call the studio_compose tool with the best-fit role + template id. After it returns, reply with one short sentence naming the Studio + template — the UI will render a clickable card from the tool result. Available menu:\n${menu}`,
      );
      break;
    }
    case "meta":
      sections.push(
        `The user is asking about the system, settings, billing, or quotas. Answer plainly. Watch/observer setup is not fully shipped yet — say so if they ask.`,
      );
      break;
    case "unclear":
    default:
      sections.push(
        `The user's intent is unclear. Ask one short clarifying question.`,
      );
      break;
  }

  return sections.join("\n\n");
}

// Tools that have real executors in this build. Tools the registry
// advertises for an intent but which aren't yet in this set get filtered
// out before the LLM sees them — otherwise the model would call a tool
// that returns "not implemented" and produce a confusing reply. PR-B
// landed route_match + studio_compose; observer_propose +
// observation_emit are still stubbed and remain filtered.
const SHIPPED_TOOL_NAMES = new Set<string>([
  "memory_search",
  "memory_fetch",
  "route_match",
  "studio_compose",
]);

function anthropicToolsForIntent(
  intent: ConversationalIntent,
): Anthropic.Messages.Tool[] {
  return toolsForIntent(intent)
    .filter((t) => SHIPPED_TOOL_NAMES.has(t.name))
    .map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.inputSchema as Anthropic.Messages.Tool.InputSchema,
    }));
}

// Anthropic SDK's content block input variant. Using `unknown` then asserting
// keeps this file from depending on private SDK paths.
type AnthropicMessage = {
  role: "user" | "assistant";
  content: unknown;
};

export function makeRealInvokeLlm(
  client: Anthropic,
  executor: HomeToolExecutor,
): InvokeLlmFn {
  return async ({ ctx, intent, onTextDelta }): Promise<LlmResult> => {
    void TOOLS; // ensure registry import is not tree-shaken
    const system = buildSystemPrompt(ctx, intent);
    const userInput =
      ctx.buffer.kind === "conversation" ? ctx.buffer.userInput : "";

    const messages: AnthropicMessage[] = [
      { role: "user", content: userInput },
    ];

    const tools = anthropicToolsForIntent(intent);
    const toolCalls: LlmToolCall[] = [];
    const extraIds = new Set<string>();
    const extraTitles: Record<string, string> = {};
    const extraTypes: Record<string, string> = {};
    let totalTokens = 0;

    for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
      // Stream each iteration. Text deltas (when the model is producing
      // user-facing prose) get forwarded to the orchestrator's callback
      // immediately so the UI sees them as they arrive. Tool-use
      // iterations typically emit little/no text before the tool call,
      // so live-streaming them costs nothing and gives the user signal
      // that something is happening behind the scenes.
      const stream = client.messages.stream({
        model: RUN_MODEL,
        max_tokens: MAX_TOKENS,
        system,
        tools: tools.length > 0 ? tools : undefined,
        messages: messages as Anthropic.Messages.MessageParam[],
      });
      if (onTextDelta) {
        stream.on("text", (delta) => onTextDelta(delta));
      }
      const resp: Anthropic.Messages.Message = await stream.finalMessage();
      totalTokens += (resp.usage?.input_tokens ?? 0) + (resp.usage?.output_tokens ?? 0);

      if (resp.stop_reason !== "tool_use") {
        const text = resp.content
          .filter((b): b is Anthropic.Messages.TextBlock => b.type === "text")
          .map((b) => b.text)
          .join("");
        return {
          text,
          toolCalls,
          tokens: totalTokens,
          extraGroundedIds: Array.from(extraIds),
          extraGroundedTitles: extraTitles,
          extraGroundedTypes: extraTypes,
        };
      }

      // Execute each tool_use block, accumulate tool_result blocks.
      const toolResults: Array<{
        type: "tool_result";
        tool_use_id: string;
        content: string;
        is_error?: boolean;
      }> = [];
      for (const block of resp.content) {
        if (block.type !== "tool_use") continue;
        const exec = await executor(block.name, block.input);
        if (exec.ok) {
          toolCalls.push({ name: block.name, input: block.input, output: exec.result });
          collectIdsFromToolResult(
            block.name,
            exec.result,
            extraIds,
            extraTitles,
            extraTypes,
          );
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: JSON.stringify(exec.result),
          });
        } else {
          toolCalls.push({ name: block.name, input: block.input, output: { error: exec.error } });
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: exec.error,
            is_error: true,
          });
        }
      }

      messages.push({ role: "assistant", content: resp.content });
      messages.push({ role: "user", content: toolResults });
    }

    // Hit iteration cap — return whatever we have plus a guard message.
    return {
      text:
        "I kept calling tools without finishing — that means I couldn't pull a clean answer from your memory. Try rephrasing the question.",
      toolCalls,
      tokens: totalTokens,
      extraGroundedIds: Array.from(extraIds),
      extraGroundedTitles: extraTitles,
      extraGroundedTypes: extraTypes,
    };
  };
}

/**
 * Pull memory IDs out of a successful tool result so the grounding
 * allowlist can be extended for the orchestrator's verifyGrounding step.
 * Shape-specific: matches the result envelopes of executeMemorySearch
 * (`{ hits: [{id, ...}] }`) and executeMemoryFetch (`{ id, ... }`).
 */
function collectIdsFromToolResult(
  name: string,
  result: unknown,
  into: Set<string>,
  titles: Record<string, string>,
  types: Record<string, string>,
): void {
  if (!result || typeof result !== "object") return;
  if (name === "memory_search") {
    const hits = (result as { hits?: unknown }).hits;
    if (Array.isArray(hits)) {
      for (const h of hits) {
        const id = (h as { id?: unknown })?.id;
        if (typeof id !== "string") continue;
        into.add(id);
        const t = (h as { title?: unknown }).title;
        if (typeof t === "string" && t.trim()) titles[id] = t.trim();
        const ty = (h as { type?: unknown }).type;
        if (typeof ty === "string" && ty.trim()) types[id] = ty.trim();
      }
    }
    return;
  }
  if (name === "memory_fetch") {
    const id = (result as { id?: unknown }).id;
    if (typeof id !== "string") return;
    into.add(id);
    const t = (result as { title?: unknown }).title;
    if (typeof t === "string" && t.trim()) titles[id] = t.trim();
    const ty = (result as { type?: unknown }).type;
    if (typeof ty === "string" && ty.trim()) types[id] = ty.trim();
  }
}
