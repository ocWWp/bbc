import "server-only";

import { NextRequest } from "next/server";

import {
  homeTurn,
  type ConversationTurn,
  type Emit,
  type HomeTurnDeps,
  type InvokeLlmFn,
  type LlmToolCall,
  type Role,
  type SseEvent,
} from "@/lib/agent";
import { requireActor } from "@/lib/auth/require-user";
import {
  appendTurn,
  finalizeTurn,
  getActiveSessionWithTurns,
  getOrCreateActiveSession,
  type HomeTurn,
} from "@/lib/home/sessions";
import { POSTHOG_METRIC_CATALOG } from "@/lib/integrations/posthog";
import { makeReserveQuota, makeReconcileQuota } from "@/lib/quota/rpc";
import { getSupabaseServerClient } from "@/lib/supabase/server";

// SSE Route Handler. Edge runtime so streaming works on Cloudflare Workers
// (the v1.6 spike confirmed Route Handlers stream; M1.2 closes the gate
// once cf:deploy is verified). Node runtime would buffer the response.
export const runtime = "edge";

// ---- Stub deps -----------------------------------------------------------
//
// Quota RPCs are real as of M4.1 (reserve_quota / reconcile_quota in
// migration 0048). The remaining stubs land later:
//   - context-builder DB: M5 polish (memory index excerpt + workspace name)
//   - real Anthropic SDK call: M5 polish
// homeTurn is invoked with the real shape; only the dep implementations
// below are stubbed.

const stubBuildContext: HomeTurnDeps["buildContext"] = async (input) => ({
  tenantId: input.tenantId,
  actorId: input.actorId,
  role: input.role,
  rolePack: { voice: "", vendors: [], decisions: [], glossary: {} },
  buffer: {
    kind: "conversation",
    turns: input.recent,
    userInput: input.userInput,
  },
  alwaysOn: { memoryIndexExcerpt: "", workspaceName: "Workspace" },
});

// Tiny rule-based "classifier" stub — saves an LLM round-trip in dev.
// Returns one of the ConversationalIntent values based on heuristics.
const stubClassify: HomeTurnDeps["classify"] = async ({ text }) => {
  const t = text.toLowerCase();
  if (t.includes("draft") || t.includes("write")) return "draft";
  if (t.includes("watch") || t.includes("monitor")) return "watch";
  if (t.includes("where") || t.includes("open") || t.includes("/")) return "navigate";
  if (t.startsWith("what") || t.includes("explain") || t.includes("how")) return "explain";
  if (t.includes("memory") || t.includes("setting") || t.startsWith("/")) return "meta";
  if (t.length < 8) return "unclear";
  return "explain";
};

function matchMetric(text: string) {
  const t = text.toLowerCase();
  for (const m of POSTHOG_METRIC_CATALOG) {
    if (t.includes(m.id.replace(/_/g, " ")) || t.includes(m.label.toLowerCase())) {
      return m;
    }
  }
  // Loose keyword fallbacks so "watch my churn rate" finds something
  // even if the user's wording doesn't match the catalog literally.
  if (t.includes("churn")) return POSTHOG_METRIC_CATALOG.find((m) => m.id === "activation_rate") ?? POSTHOG_METRIC_CATALOG[0];
  if (t.includes("user")) return POSTHOG_METRIC_CATALOG.find((m) => m.id === "dau") ?? POSTHOG_METRIC_CATALOG[0];
  return POSTHOG_METRIC_CATALOG[0];
}

const stubInvokeLlm: InvokeLlmFn = async ({ intent, ctx }) => {
  const last = ctx.buffer.kind === "conversation" ? ctx.buffer.userInput : "";
  const text = (() => {
    switch (intent) {
      case "navigate":
        return `You can open that from the left nav. Want me to take you there?`;
      case "draft":
        return `Drafting now — give me one second.`;
      case "watch": {
        const m = matchMetric(last);
        return `I can set up a watch on ${m.label}. Click below to wire it up — nothing runs until you enable it.`;
      }
      case "explain":
        return `Got it: "${last}". (Stub response — real LLM lands in M3.)`;
      case "meta":
        return `That's a settings/memory question — opening the right place.`;
      case "unclear":
      default:
        return `Tell me a little more — what are you trying to do?`;
    }
  })();
  const toolCalls: LlmToolCall[] = (() => {
    if (intent === "navigate") {
      return [
        {
          name: "route_match",
          input: { query: last },
          output: { route: "/memory", label: "Memory" },
        },
      ];
    }
    if (intent === "watch") {
      const m = matchMetric(last);
      return [
        {
          name: "watch_proposed",
          input: { query: last },
          output: {
            metric: m.id,
            metricLabel: m.label,
            source: "posthog",
            projectId: process.env.POSTHOG_PROJECT_ID ?? "",
            region: (process.env.POSTHOG_REGION as "us" | "eu") || "us",
          },
        },
      ];
    }
    return [];
  })();
  return { text, toolCalls, tokens: 0 };
};

// ---- POST handler --------------------------------------------------------

type PostBody = { userText?: string };

const SSE_HEADERS = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  // Cloudflare Workers respect this. Without it some edges buffer the body.
  "X-Accel-Buffering": "no",
} as const;

function encodeSse(event: SseEvent): string {
  return `event: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`;
}

export async function POST(req: NextRequest) {
  const actorRes = await requireActor();
  if (!actorRes.ok) {
    return new Response("unauthorized", { status: 401 });
  }
  const actor = actorRes.actor;

  let body: PostBody = {};
  try {
    body = (await req.json()) as PostBody;
  } catch {
    return new Response("bad request: invalid JSON", { status: 400 });
  }
  const userText = (body.userText ?? "").trim();
  if (!userText) {
    return new Response("bad request: userText required", { status: 400 });
  }

  // Resolve session + recent turns BEFORE opening the stream so the auth +
  // RLS round-trips happen synchronously and any failure surfaces as a
  // plain HTTP error (not a half-opened SSE).
  const session = await getOrCreateActiveSession(actor.tenant_id, actor.user_id);
  const existing = await getActiveSessionWithTurns(actor.tenant_id, actor.user_id, 20);
  const recent: ConversationTurn[] = (existing?.turns ?? [])
    .filter((t) => t.role === "user" || t.role === "agent")
    .map((t) => ({
      role: t.role,
      text: extractText(t.content_jsonb),
    }));

  // Persist the user turn immediately. The assistant turn is created in
  // status='in_progress' so a page refresh mid-stream can render an
  // 'interrupted' banner instead of a partial-looking message.
  await appendTurn(session.id, "user", { text: userText });
  const assistant = await appendTurn(
    session.id,
    "agent",
    { text: "", toolCalls: [], citations: [] },
    "in_progress",
  );

  const encoder = new TextEncoder();
  const collected = {
    text: "",
    toolCalls: [] as Array<{ name: string; payload: unknown }>,
    citations: [] as string[],
    status: "completed" as "completed" | "aborted" | "failed",
    errorMsg: undefined as string | undefined,
  };

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit: Emit = (e) => {
        // Mirror SSE state into a local buffer so we can finalize the
        // assistant turn with the full content after the stream closes.
        if (e.event === "text-delta") collected.text += e.data.delta;
        if (e.event === "action-card") {
          collected.toolCalls.push({ name: e.data.kind, payload: e.data.payload });
        }
        if (e.event === "citation") collected.citations.push(e.data.memoryId);
        if (e.event === "turn-end") {
          collected.status = e.data.status;
          collected.errorMsg = e.data.error;
        }
        try {
          controller.enqueue(encoder.encode(encodeSse(e)));
        } catch {
          // controller already closed — abort path raced ahead.
        }
      };

      // Wire abort: when the client disconnects, mark the assistant turn
      // 'aborted' and close the controller. homeTurn itself does not yet
      // accept an AbortSignal; cancelling the in-flight LLM call is a
      // follow-up once real Anthropic streaming lands (M3+). The DB
      // record reflects intent regardless.
      const onAbort = async () => {
        try {
          await finalizeTurn(
            assistant.id,
            {
              text: collected.text,
              toolCalls: collected.toolCalls,
              citations: collected.citations,
            } as unknown as import("@/lib/supabase/database.types").Json,
            "aborted",
          );
        } finally {
          try {
            controller.close();
          } catch {
            /* already closed */
          }
        }
      };
      req.signal.addEventListener("abort", onAbort, { once: true });

      const supabase = await getSupabaseServerClient();
      const deps: HomeTurnDeps = {
        reserveQuota: makeReserveQuota(supabase),
        reconcileQuota: makeReconcileQuota(supabase),
        buildContext: stubBuildContext,
        classify: stubClassify,
        invokeLlm: stubInvokeLlm,
        retrievedMemoryIds: [],
      };

      try {
        await homeTurn(
          {
            tenantId: actor.tenant_id,
            actorId: actor.user_id,
            role: actor.role as Role,
            userInput: userText,
            recent,
          },
          deps,
          emit,
        );
      } catch (err) {
        collected.status = "failed";
        collected.errorMsg = err instanceof Error ? err.message : String(err);
        try {
          controller.enqueue(
            encoder.encode(
              encodeSse({
                event: "turn-end",
                data: { status: "failed", error: collected.errorMsg },
              }),
            ),
          );
        } catch {
          /* already closed */
        }
      } finally {
        req.signal.removeEventListener("abort", onAbort);
        // Don't double-finalize if abort already wrote 'aborted'.
        if (!req.signal.aborted) {
          try {
            await finalizeTurn(
              assistant.id,
              {
                text: collected.text,
                toolCalls: collected.toolCalls,
                citations: collected.citations,
              } as unknown as import("@/lib/supabase/database.types").Json,
              collected.status === "completed" ? "completed" : collected.status,
            );
          } catch (finErr) {
            void finErr;
          }
        }
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
  });

  return new Response(stream, { headers: SSE_HEADERS });
}

function extractText(content: HomeTurn["content_jsonb"]): string {
  if (content && typeof content === "object" && !Array.isArray(content)) {
    const t = (content as Record<string, unknown>).text;
    if (typeof t === "string") return t;
  }
  return "";
}
