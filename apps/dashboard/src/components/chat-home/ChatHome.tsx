"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MotionConfig, motion } from "framer-motion";
import { toast } from "sonner";

import { TurnView, type TurnViewModel } from "./TurnView";

export type WatchingChip = {
  id: string;
  /** Short label — metric id or human label. */
  label: string;
};

export type ChatHomeProps = {
  /** Server-rendered cold-start greeting. Shown when there are no turns. */
  greeting: string;
  /** Turns hydrated from the active session on page load. */
  initialTurns: TurnViewModel[];
  /** Enabled observer signals for this tenant. Empty → no strip rendered. */
  watching?: WatchingChip[];
  /**
   * Active session id from the URL `?session=` param, or `null` when we're
   * on the bare /home greeting. Threaded into the POST body so the server
   * knows whether to start a new session or append to an existing one.
   */
  sessionId?: string | null;
};

export function ChatHome({
  greeting,
  initialTurns,
  watching = [],
  sessionId = null,
}: ChatHomeProps) {
  const router = useRouter();
  const [turns, setTurns] = useState<TurnViewModel[]>(initialTurns);
  const [draft, setDraft] = useState("");
  const [streaming, setStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const scrollAnchorRef = useRef<HTMLDivElement | null>(null);
  // Buffer for the session id from the SSE `session-created` event. The
  // route emits it as the first frame of a new chat; we don't navigate
  // until `turn-end` so the URL change can't tear down a live stream.
  const pendingSessionIdRef = useRef<string | null>(null);
  // Don't fight the user — only auto-scroll if they're already pinned near
  // the bottom. Updated on every wheel/touch via the scroll listener below.
  const stickToBottomRef = useRef(true);

  useEffect(() => {
    function onScroll() {
      // 80px slack — counts as "at bottom" if within an input-bar height.
      stickToBottomRef.current =
        window.innerHeight + window.scrollY >= document.body.scrollHeight - 80;
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!stickToBottomRef.current) return;
    // "auto" beats "smooth" during streaming — smooth queues animations that
    // stutter on each text-delta. The anchor's scrollMarginBottom lifts the
    // viewport above the fixed composer bar (~76px + breathing room).
    scrollAnchorRef.current?.scrollIntoView({ behavior: "auto", block: "end" });
  }, [turns]);

  const send = useCallback(async () => {
    const text = draft.trim();
    if (!text || streaming) return;
    setDraft("");

    // Optimistic local turns — the server is the source of truth for ids,
    // but we render before the network round-trips so input feels instant.
    const tempUserId = `local-user-${Date.now()}`;
    const tempAgentId = `local-agent-${Date.now()}`;
    setTurns((prev) => [
      ...prev,
      {
        id: tempUserId,
        role: "user",
        status: "completed",
        text,
        toolCalls: [],
        citations: [],
      },
      {
        id: tempAgentId,
        role: "agent",
        status: "in_progress",
        text: "",
        toolCalls: [],
        citations: [],
        streaming: true,
      },
    ]);

    const abort = new AbortController();
    abortRef.current = abort;
    setStreaming(true);

    try {
      const res = await fetch("/api/home/turn", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userText: text, sessionId }),
        signal: abort.signal,
      });
      // 410 Gone → the session was deleted between page load and submit
      // (another tab, another device, or this tab's own delete). Clear
      // the optimistic user+agent turns we just pushed, surface a toast,
      // and bounce back to /home so the rail re-renders without the row.
      if (res.status === 410) {
        await res.text().catch(() => "");
        setTurns((prev) =>
          prev.filter((t) => t.id !== tempUserId && t.id !== tempAgentId),
        );
        toast.error("This chat was deleted");
        router.push("/home");
        return;
      }
      if (!res.ok || !res.body) {
        const bodyText = await res.text().catch(() => "");
        const detail = bodyText.trim().slice(0, 300);
        markFailed(
          setTurns,
          tempAgentId,
          detail ? `Request failed (${res.status}): ${detail}` : `Request failed (${res.status})`,
        );
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      // Read until the stream closes. SSE events are separated by \n\n;
      // we accumulate partial bytes between reads and parse only complete
      // events to avoid splitting an event mid-line.
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let idx = buffer.indexOf("\n\n");
        while (idx !== -1) {
          const raw = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          handleSseFrame(raw, tempAgentId, setTurns, pendingSessionIdRef);
          idx = buffer.indexOf("\n\n");
        }
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        markAborted(setTurns, tempAgentId);
      } else {
        markFailed(setTurns, tempAgentId, (err as Error).message);
      }
    } finally {
      abortRef.current = null;
      setStreaming(false);
      // After streaming ends, drop the streaming cursor on the agent turn.
      setTurns((prev) =>
        prev.map((t) =>
          t.id === tempAgentId && t.status === "in_progress"
            ? { ...t, status: "completed", streaming: false }
            : { ...t, streaming: t.id === tempAgentId ? false : t.streaming },
        ),
      );
      // If the server announced a new session id mid-stream, flush the
      // URL change now (after turn-end has finished updating local state).
      // Doing it here — rather than inline in the SSE switch — keeps the
      // router.replace off the streaming hot path and ensures exactly-once
      // by reading + clearing the buffered ref atomically.
      const pendingId = pendingSessionIdRef.current;
      if (pendingId) {
        pendingSessionIdRef.current = null;
        router.replace(`?${new URLSearchParams({ session: pendingId }).toString()}`);
        router.refresh();
      }
    }
  }, [draft, streaming, sessionId, router]);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const empty = turns.length === 0;

  return (
    // reducedMotion="user" honors the OS prefers-reduced-motion setting
    // for every motion component nested below — turn enter, action card
    // enter, button press, chip hover. No per-component opt-in needed.
    <MotionConfig reducedMotion="user">
    <div className="home-pilot" data-testid="chat-home">
    <div className="container page">
      {/*
        Chat-app feel per F15: the page-title was redundant with the
        breadcrumb and shouted the same line in every state. The crumb
        carries enough page-identity for a conversational surface; the
        composer + greeting do the rest. A visually-hidden <h1> stays
        for screen-reader landmark / outline integrity.
      */}
      <h1 className="sr-only">Home — ask your second brain</h1>
      <header className="page-head">
        <div className="page-head-left">
          <div className="page-crumb">
            <span className="current">home</span>
          </div>
        </div>
      </header>

      {watching.length > 0 && (
        <div
          className="mx-auto mb-4 flex w-full max-w-3xl flex-wrap items-center gap-2"
          data-testid="watching-strip"
        >
          <span className="text-xs uppercase tracking-wide text-muted-foreground">
            Watching
          </span>
          {watching.map((w) => (
            <button
              key={w.id}
              type="button"
              className="rounded-full border border-border bg-card px-3 py-1 text-xs hover:bg-muted"
              data-testid={`watching-chip-${w.id}`}
              onClick={() => setDraft(`tell me about my ${w.label} watch`)}
            >
              {w.label}
            </button>
          ))}
        </div>
      )}

      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 pb-32">
        {empty ? (
          <>
            <div
              className="rounded-2xl border border-dashed border-border bg-muted/20 p-6 text-base leading-relaxed text-muted-foreground"
              data-testid="empty-greeting"
            >
              {greeting}
            </div>
            <div
              className="flex flex-wrap gap-2"
              data-testid="example-prompts"
            >
              {EXAMPLE_PROMPTS.map((p, i) => (
                <motion.button
                  key={p.label}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2, delay: 0.05 + i * 0.05, ease: "easeOut" }}
                  whileHover={{ y: -1 }}
                  whileTap={{ scale: 0.97 }}
                  type="button"
                  onClick={() => setDraft(p.prompt)}
                  className="rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                  data-testid={`example-prompt-${p.intent}`}
                >
                  <span className="font-medium text-foreground/80">{p.label}</span>
                  <span className="ml-1.5 opacity-60">{p.hint}</span>
                </motion.button>
              ))}
            </div>
          </>
        ) : (
          turns.map((t) => <TurnView key={t.id} turn={t} />)
        )}
        <div ref={scrollAnchorRef} className="scroll-mb-40" />
      </div>

      <div className="home-composer fixed inset-x-0 bottom-0 z-10 border-t border-border bg-background/95 px-4 py-4 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto flex w-full max-w-3xl items-end gap-2">
          <textarea
            className="min-h-[44px] max-h-[160px] flex-1 resize-none rounded-xl border border-border bg-card px-4 py-2.5 text-sm leading-relaxed shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder="Ask anything, or describe what you want me to watch…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            data-testid="composer-input"
            disabled={streaming}
          />
          {streaming ? (
            <motion.button
              whileTap={{ scale: 0.97 }}
              type="button"
              onClick={cancel}
              className="home-stop rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-medium hover:bg-muted"
              data-testid="composer-cancel"
            >
              Stop
            </motion.button>
          ) : (
            <motion.button
              whileTap={{ scale: 0.97 }}
              type="button"
              onClick={() => void send()}
              disabled={!draft.trim()}
              className="home-send rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-sm hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              data-testid="composer-send"
            >
              Send
            </motion.button>
          )}
        </div>
        <div className="mx-auto mt-2 flex w-full max-w-3xl justify-end px-1 text-[11px] text-muted-foreground">
          <span className="font-mono">↵ to send · ⇧↵ for newline</span>
        </div>
      </div>
      </div>
    </div>
    </MotionConfig>
  );
}

// ---- SSE frame parsing ---------------------------------------------------

function handleSseFrame(
  raw: string,
  agentTurnId: string,
  setTurns: React.Dispatch<React.SetStateAction<TurnViewModel[]>>,
  pendingSessionIdRef: React.MutableRefObject<string | null>,
) {
  // Parse the `event:` and `data:` lines out of one frame.
  let event = "";
  let data = "";
  for (const line of raw.split("\n")) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) data += line.slice(5).trim();
  }
  if (!event) return;
  let parsed: Record<string, unknown> = {};
  try {
    parsed = data ? (JSON.parse(data) as Record<string, unknown>) : {};
  } catch {
    return;
  }

  // `session-created` is the first frame for a new chat — buffer the id
  // and defer the URL change to `turn-end` so we don't race the stream.
  if (event === "session-created") {
    const id = typeof parsed.sessionId === "string" ? parsed.sessionId : "";
    if (id) pendingSessionIdRef.current = id;
    return;
  }

  setTurns((prev) =>
    prev.map((t) => {
      if (t.id !== agentTurnId) return t;
      switch (event) {
        case "text-delta": {
          const delta = typeof parsed.delta === "string" ? parsed.delta : "";
          return { ...t, text: t.text + delta };
        }
        case "text-replace": {
          const text = typeof parsed.text === "string" ? parsed.text : t.text;
          return { ...t, text };
        }
        case "action-card": {
          const kind = typeof parsed.kind === "string" ? parsed.kind : "unknown";
          return {
            ...t,
            toolCalls: [...t.toolCalls, { name: kind, payload: parsed.payload }],
          };
        }
        case "citation": {
          const id = typeof parsed.memoryId === "string" ? parsed.memoryId : "";
          if (!id || t.citations.some((c) => c.id === id)) return t;
          const title =
            typeof parsed.title === "string" && parsed.title.trim().length > 0
              ? parsed.title.trim()
              : null;
          return { ...t, citations: [...t.citations, { id, title }] };
        }
        case "turn-end": {
          const status = typeof parsed.status === "string" ? parsed.status : "completed";
          return {
            ...t,
            status: (status as TurnViewModel["status"]) ?? "completed",
            streaming: false,
          };
        }
        default:
          return t;
      }
    }),
  );
}

function markFailed(
  setTurns: React.Dispatch<React.SetStateAction<TurnViewModel[]>>,
  agentTurnId: string,
  msg: string,
) {
  setTurns((prev) =>
    prev.map((t) =>
      t.id === agentTurnId
        ? { ...t, status: "failed", streaming: false, text: t.text || msg }
        : t,
    ),
  );
}

function markAborted(
  setTurns: React.Dispatch<React.SetStateAction<TurnViewModel[]>>,
  agentTurnId: string,
) {
  setTurns((prev) =>
    prev.map((t) =>
      t.id === agentTurnId ? { ...t, status: "aborted", streaming: false } : t,
    ),
  );
}

// Shown only in the empty/greeting state. Each chip maps to one of the
// three shipped conversational intents (explain / navigate / draft) so
// clicking through always lands on a working tool path — never a stub.
const EXAMPLE_PROMPTS: ReadonlyArray<{
  intent: "explain" | "navigate" | "draft";
  label: string;
  hint: string;
  prompt: string;
}> = [
  {
    intent: "explain",
    label: "Explain",
    hint: "what did we decide about voice?",
    prompt: "What did we decide about voice and tone?",
  },
  {
    intent: "navigate",
    label: "Navigate",
    hint: "where do I manage API keys?",
    prompt: "Where do I manage API keys?",
  },
  {
    intent: "draft",
    label: "Draft",
    hint: "a tweet about this week's progress",
    prompt: "Draft a tweet about this week's progress.",
  },
];
