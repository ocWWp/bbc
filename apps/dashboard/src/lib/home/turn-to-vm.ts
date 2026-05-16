// Pure transformer: turns a persisted HomeTurn row from the database
// into the TurnViewModel the chat UI consumes. Extracted from the home
// page so it can be unit-tested without bringing the route's
// auth/data-fetching machinery along.

import type { CitationRef, TurnViewModel } from "@/components/chat-home/TurnView";
import type { HomeTurn } from "./sessions";

export function turnToVm(t: HomeTurn): TurnViewModel {
  const content =
    t.content_jsonb && typeof t.content_jsonb === "object" && !Array.isArray(t.content_jsonb)
      ? (t.content_jsonb as Record<string, unknown>)
      : {};
  const toolCallsRaw = Array.isArray(content.toolCalls) ? content.toolCalls : [];
  const toolCalls = toolCallsRaw
    .map((c) => (c && typeof c === "object" ? (c as Record<string, unknown>) : null))
    .filter((c): c is Record<string, unknown> => c !== null)
    .map((c) => ({
      name: typeof c.name === "string" ? c.name : "unknown",
      payload: c.payload,
    }));
  // Back-compat: pre-F5 rows persist citations as string[] (just ids);
  // F5+ rows persist as Array<{id, title?}>. Accept either shape; rows
  // that arrived as bare strings get title=null and the chip falls back
  // to the short-uuid label.
  const citations: CitationRef[] = Array.isArray(content.citations)
    ? (content.citations as unknown[])
        .map((x): CitationRef | null => {
          if (typeof x === "string") return { id: x, title: null };
          if (x && typeof x === "object") {
            const obj = x as Record<string, unknown>;
            const id = typeof obj.id === "string" ? obj.id : null;
            if (!id) return null;
            const title = typeof obj.title === "string" ? obj.title : null;
            return { id, title };
          }
          return null;
        })
        .filter((c): c is CitationRef => c !== null)
    : [];
  // A persisted turn with status='in_progress' is necessarily stale —
  // the SSE stream that would have advanced it died (browser closed,
  // server restart, network drop). Migration 0045 introduced this status
  // exactly so a mid-stream refresh shows "interrupted" rather than a
  // mute partial-text bubble. Surface that intent at the UI boundary by
  // mapping in_progress → aborted on hydration. Live turns produced
  // locally inside ChatHome never pass through this function.
  const status: TurnViewModel["status"] =
    t.status === "in_progress" ? "aborted" : t.status;
  return {
    id: t.id,
    role: t.role,
    status,
    text: typeof content.text === "string" ? content.text : "",
    toolCalls,
    citations,
  };
}
