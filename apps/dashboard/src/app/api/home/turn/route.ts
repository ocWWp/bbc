import "server-only";

import { NextRequest } from "next/server";

import {
  homeTurn,
  type ConversationTurn,
  type Emit,
  type HomeTurnDeps,
  type Role,
  type SseEvent,
} from "@/lib/agent";
import { classifyIntent } from "@/lib/agent/classify";
import { requireActor, requireRole } from "@/lib/auth/require-user";
import {
  appendTurn,
  createSession,
  deriveTitle,
  finalizeTurn,
  getSessionWithTurns,
  softDeleteSession,
  updateSessionTitle,
  type HomeSession,
  type HomeTurn,
} from "@/lib/home/sessions";
import { makeRealClassify } from "@/lib/home/real-classify";
import {
  memoryTitlesOf,
  memoryTypesOf,
  retrieveHomeContext,
  makeBuildContextFromRetrieval,
  retrievedMemoryIdsOf,
} from "@/lib/home/real-context";
import { makeHomeToolExecutor } from "@/lib/home/tool-impls";
import { makeRealInvokeLlm } from "@/lib/home/real-invoke";
import { makeReserveQuota, makeReconcileQuota } from "@/lib/quota/rpc";
import { getAnthropicClient } from "@/lib/secrets/anthropic-client";
import { getSupabaseServerClient } from "@/lib/supabase/server";

// SSE Route Handler. Default (Node) runtime under OpenNext on Cloudflare.
//
// Originally shipped as `export const runtime = "edge"` — the v1.6 spike
// confirmed SSE streams from edge. In prod that crashed the route module at
// request time with `TypeError: Cannot read properties of undefined (reading
// 'default')` from inside Next 16's edge runtime adapter — POST never ran,
// every request returned the generic OpenNext "Internal Server Error" body.
// Disabling edge runtime makes the route load + serve. v1.7 follow-up:
// re-enable edge once we identify the import that fails to bundle, or
// confirm OpenNext's Node runtime flushes SSE incrementally for real LLM
// streaming (stub responses are small enough that buffering is invisible).

// Real deps assembly happens inside postImpl per request — see below.
// The orchestrator (`homeTurn` in @/lib/agent/home-turn) stays stateless;
// route.ts is the composition root that resolves the per-tenant Anthropic
// client, pre-fetches memory rows, and wires the executors.

// ---- POST handler --------------------------------------------------------

type PostBody = { userText?: string; sessionId?: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
  try {
    return await postImpl(req);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[home/turn] fatal:", msg, err);
    return new Response(`home_turn fatal: ${msg}`, { status: 500 });
  }
}

async function postImpl(req: NextRequest) {
  const auth = await requireActor();
  if (!auth.ok) {
    return Response.json({ error: "unauth" }, { status: 401 });
  }
  const roleCheck = requireRole(auth.actor, "admin");
  if (!roleCheck.ok) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  const actor = auth.actor;

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

  // sessionId is optional. Empty string is treated as absent. Any non-empty
  // value MUST be a syntactically valid UUID — RLS at the DB layer would
  // reject malformed ids too, but a 400 here gives the client a clearer
  // failure mode than a generic 410.
  const rawSessionId = body.sessionId;
  const sessionId =
    typeof rawSessionId === "string" && rawSessionId.length > 0
      ? rawSessionId
      : null;
  if (sessionId !== null && !UUID_RE.test(sessionId)) {
    return Response.json({ error: "invalid_session_id" }, { status: 400 });
  }

  // Resolve session + recent turns BEFORE opening the stream so the auth +
  // RLS round-trips happen synchronously and any failure surfaces as a
  // plain HTTP error (not a half-opened SSE). Wrap so the body reveals the
  // real cause instead of an opaque 500 — the chat UI surfaces res.status
  // and the body text in the failed-turn banner.
  //
  // Two paths:
  //   sessionId present → strict ownership read; 410 on miss
  //   sessionId absent  → create a brand-new session, no recent context
  let session: HomeSession;
  let recent: ConversationTurn[];
  let isNewSession = false;
  try {
    if (sessionId !== null) {
      const found = await getSessionWithTurns(
        sessionId,
        actor.tenant_id,
        actor.user_id,
        20,
      );
      if (!found) {
        return Response.json({ error: "session_not_found" }, { status: 410 });
      }
      session = found.session;
      recent = found.turns
        .filter((t) => t.role === "user" || t.role === "agent")
        .map((t) => ({
          role: t.role,
          text: extractText(t.content_jsonb),
        }));
    } else {
      session = await createSession(actor.tenant_id, actor.user_id);
      recent = [];
      isNewSession = true;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[home/turn] session resolution failed:", msg, err);
    return new Response(`home_turn setup failed: ${msg}`, { status: 500 });
  }

  // Persist the user turn. If the insert fails on a brand-new session, soft-
  // delete the just-created row so we don't leave an orphan empty session
  // cluttering the rail. The assistant turn is created in status='in_progress'
  // so a page refresh mid-stream can render an 'interrupted' banner instead
  // of a partial-looking message.
  let assistant: Awaited<ReturnType<typeof appendTurn>>;
  try {
    await appendTurn(session.id, "user", { text: userText });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[home/turn] user-turn insert failed:", msg, err);
    if (isNewSession) {
      try {
        await softDeleteSession(session.id, actor.tenant_id, actor.user_id);
      } catch (cleanupErr) {
        console.error(
          "[home/turn] orphan session cleanup failed:",
          cleanupErr instanceof Error ? cleanupErr.message : cleanupErr,
        );
      }
    }
    return Response.json({ error: "turn_insert_failed" }, { status: 500 });
  }

  // Write a derived title for brand-new sessions so the rail can render
  // something more useful than "(empty)". Existing sessions keep whatever
  // title they were created with.
  if (isNewSession) {
    try {
      await updateSessionTitle(
        session.id,
        userText,
        actor.tenant_id,
        actor.user_id,
      );
    } catch (titleErr) {
      // Title is best-effort — failures shouldn't kill the turn. The rail
      // falls back to "(empty)" via listSessions().
      console.error(
        "[home/turn] updateSessionTitle failed:",
        titleErr instanceof Error ? titleErr.message : titleErr,
      );
    }
  }

  try {
    assistant = await appendTurn(
      session.id,
      "agent",
      { text: "", toolCalls: [], citations: [] },
      "in_progress",
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[home/turn] assistant-turn insert failed:", msg, err);
    return new Response(`home_turn setup failed: ${msg}`, { status: 500 });
  }

  const encoder = new TextEncoder();
  const collected = {
    text: "",
    toolCalls: [] as Array<{ name: string; payload: unknown }>,
    citations: [] as Array<{
      id: string;
      title?: string | null;
      type?: string | null;
    }>,
    status: "completed" as "completed" | "aborted" | "failed",
    errorMsg: undefined as string | undefined,
  };
  // Pre-compute the derived title for the session-created event so we emit
  // exactly the same string that was just written to the DB (deriveTitle is
  // pure, so this matches the updateSessionTitle write above).
  const newSessionTitle = isNewSession ? deriveTitle(userText) : "";

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const writeSse = (e: SseEvent) => {
        try {
          controller.enqueue(encoder.encode(encodeSse(e)));
        } catch {
          // controller already closed — abort path raced ahead.
        }
      };

      // Cast helper for the finalize content payload. Centralizes the
      // unknown-as-Json bridge so the three call sites read uniformly.
      const toJsonContent = () =>
        ({
          text: collected.text,
          toolCalls: collected.toolCalls,
          citations: collected.citations,
        }) as unknown as import("@/lib/supabase/database.types").Json;

      // Emit session-created as the very first event so the client can
      // update its URL (?session=<id>) before any text streams in. Skipped
      // for existing sessions — the client already knows its sessionId.
      if (isNewSession) {
        writeSse({
          event: "session-created",
          data: { sessionId: session.id, title: newSessionTitle },
        });
      }

      const emit: Emit = (e) => {
        // Mirror SSE state into a local buffer so we can finalize the
        // assistant turn with the full content after the stream closes.
        if (e.event === "text-delta") collected.text += e.data.delta;
        if (e.event === "text-replace") collected.text = e.data.text;
        if (e.event === "action-card") {
          collected.toolCalls.push({ name: e.data.kind, payload: e.data.payload });
        }
        if (e.event === "citation") {
          collected.citations.push({
            id: e.data.memoryId,
            title: e.data.title ?? null,
            type: e.data.type ?? null,
          });
        }
        if (e.event === "turn-end") {
          // Intercept turn-end: capture status/error but do NOT forward to
          // the stream. The route emits a single enriched turn-end after
          // homeTurn resolves so we can include the post-finalize
          // last_activity_at in one place rather than four (homeTurn happy,
          // quota failure, route catch, anthropic-failure).
          collected.status = e.data.status;
          collected.errorMsg = e.data.error;
          return;
        }
        writeSse(e);
      };

      // Hoist supabase so the abort handler and lastActivityAt reader can
      // both reach it. Filled in once the first await inside try resolves.
      let supabase: Awaited<ReturnType<typeof getSupabaseServerClient>> | null =
        null;

      // Reads home_sessions.last_activity_at for the current session so we
      // can include it in the final turn-end event. Best-effort — a failed
      // read just omits the field (client falls back to local time).
      const readLastActivityAt = async (): Promise<string | undefined> => {
        if (!supabase) return undefined;
        try {
          const { data } = await supabase
            .from("home_sessions")
            .select("last_activity_at")
            .eq("id", session.id)
            .maybeSingle();
          const v = (data as { last_activity_at?: string } | null)
            ?.last_activity_at;
          return typeof v === "string" ? v : undefined;
        } catch {
          return undefined;
        }
      };

      // Wire abort: when the client disconnects, mark the assistant turn
      // 'aborted' and close the controller. homeTurn itself does not yet
      // accept an AbortSignal; cancelling the in-flight LLM call is a
      // follow-up once real Anthropic streaming lands (M3+). The DB
      // record reflects intent regardless.
      const onAbort = async () => {
        try {
          await finalizeTurn(assistant.id, toJsonContent(), "aborted");
        } finally {
          try {
            controller.close();
          } catch {
            /* already closed */
          }
        }
      };
      req.signal.addEventListener("abort", onAbort, { once: true });

      try {
        supabase = await getSupabaseServerClient();

        const clientRes = await getAnthropicClient(supabase, actor.tenant_id);
        if (!clientRes.ok) {
          // Emit the user-visible chat copy here, then throw so the
          // unified outer catch handles finalize + enriched turn-end +
          // listener removal. Avoids duplicating the terminal-event path.
          emit({ event: "text-delta", data: { delta: clientRes.error } });
          throw new Error(`anthropic_client_failed: ${clientRes.error}`);
        }
        const anthropicClient = clientRes.client;

        const retrieved = await retrieveHomeContext(
          supabase,
          actor.tenant_id,
          userText,
        );

        const classifierLlm = makeRealClassify(anthropicClient);
        const executor = makeHomeToolExecutor(supabase, actor.tenant_id);

        const deps: HomeTurnDeps = {
          reserveQuota: makeReserveQuota(supabase),
          reconcileQuota: makeReconcileQuota(supabase),
          buildContext: makeBuildContextFromRetrieval(retrieved),
          classify: (input) =>
            classifyIntent(input.text, input.recent, classifierLlm),
          invokeLlm: makeRealInvokeLlm(anthropicClient, executor),
          retrievedMemoryIds: retrievedMemoryIdsOf(retrieved),
          memoryTitles: memoryTitlesOf(retrieved),
          memoryTypes: memoryTypesOf(retrieved),
        };

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
        // Any throw between getSupabaseServerClient and homeTurn lands
        // here. The anthropic-failure path also throws into this catch
        // after emitting the user-visible text-delta. Mark failed and
        // fall through to finally for finalize + enriched turn-end.
        collected.status = "failed";
        collected.errorMsg =
          err instanceof Error ? err.message : String(err);
      } finally {
        // Listener cleanup is unconditional so we never leak a stale
        // onAbort that would overwrite a 'failed' or 'completed' status
        // with 'aborted' after the response logically finished.
        req.signal.removeEventListener("abort", onAbort);
        // Don't double-finalize if abort already wrote 'aborted'.
        if (!req.signal.aborted) {
          try {
            await finalizeTurn(
              assistant.id,
              toJsonContent(),
              collected.status === "completed" ? "completed" : collected.status,
            );
          } catch (finErr) {
            console.error("[home/turn] finalize-on-end failed:", finErr);
          }
          // Emit the enriched turn-end AFTER finalize so the client knows
          // the assistant row is durable when it sees turn-end. The
          // lastActivityAt read is best-effort — the client falls back to
          // local time if it's missing.
          const lastActivityAt = await readLastActivityAt();
          writeSse({
            event: "turn-end",
            data: {
              status: collected.status,
              ...(collected.errorMsg ? { error: collected.errorMsg } : {}),
              ...(lastActivityAt ? { lastActivityAt } : {}),
            },
          });
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
