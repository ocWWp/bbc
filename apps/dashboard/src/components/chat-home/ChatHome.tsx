"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { TurnView, type TurnViewModel } from "./TurnView";

export type ChatHomeProps = {
  /** Server-rendered cold-start greeting. Shown when there are no turns. */
  greeting: string;
  /** Turns hydrated from the active session on page load. */
  initialTurns: TurnViewModel[];
};

export function ChatHome({ greeting, initialTurns }: ChatHomeProps) {
  const [turns, setTurns] = useState<TurnViewModel[]>(initialTurns);
  const [draft, setDraft] = useState("");
  const [streaming, setStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const scrollAnchorRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    scrollAnchorRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
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
        body: JSON.stringify({ userText: text }),
        signal: abort.signal,
      });
      if (!res.ok || !res.body) {
        markFailed(setTurns, tempAgentId, `Request failed (${res.status})`);
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
          handleSseFrame(raw, tempAgentId, setTurns);
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
    }
  }, [draft, streaming]);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const empty = turns.length === 0;

  return (
    <div className="container page" data-testid="chat-home">
      <header className="page-head">
        <div className="page-head-left">
          <div className="page-crumb">
            <span className="current">home</span>
          </div>
          <h1 className="page-title">
            ask <span className="serif">— your second brain</span>
          </h1>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 pb-32">
        {empty ? (
          <div
            className="rounded-2xl border border-dashed border-border bg-muted/20 p-6 text-base leading-relaxed text-muted-foreground"
            data-testid="empty-greeting"
          >
            {greeting}
          </div>
        ) : (
          turns.map((t) => <TurnView key={t.id} turn={t} />)
        )}
        <div ref={scrollAnchorRef} />
      </div>

      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-border bg-background/95 px-4 py-4 backdrop-blur supports-[backdrop-filter]:bg-background/80">
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
            <button
              type="button"
              onClick={cancel}
              className="rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-medium hover:bg-muted"
              data-testid="composer-cancel"
            >
              Stop
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void send()}
              disabled={!draft.trim()}
              className="rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-sm hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              data-testid="composer-send"
            >
              Send
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ---- SSE frame parsing ---------------------------------------------------

function handleSseFrame(
  raw: string,
  agentTurnId: string,
  setTurns: React.Dispatch<React.SetStateAction<TurnViewModel[]>>,
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

  setTurns((prev) =>
    prev.map((t) => {
      if (t.id !== agentTurnId) return t;
      switch (event) {
        case "text-delta": {
          const delta = typeof parsed.delta === "string" ? parsed.delta : "";
          return { ...t, text: t.text + delta };
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
          if (!id || t.citations.includes(id)) return t;
          return { ...t, citations: [...t.citations, id] };
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
