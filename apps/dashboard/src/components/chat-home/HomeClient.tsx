"use client";

import { useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { ChatHome, type WatchingChip } from "./ChatHome";
import { SessionRail } from "./SessionRail";
import { SessionRailShell } from "./SessionRailShell";
import type { TurnViewModel } from "./TurnView";
import type { SessionRailItem } from "@/lib/home/sessions";
import { deleteSessionAction } from "@/app/home/actions";

export type HomeClientProps = {
  /**
   * Selected session id from `?session=` on the server. `null` when the
   * user is on the bare `/home` greeting state.
   */
  sessionId: string | null;
  /** Rail list (lite shape) for the chat-history aside. */
  sessions: SessionRailItem[];
  /** Server-rendered greeting string. Threaded through to ChatHome. */
  greeting: string;
  /** Turns already loaded for `sessionId`, or [] when on `/home`. */
  initialTurns: TurnViewModel[];
  /** Tenant's enabled observer-signal chips. */
  watching: WatchingChip[];
};

/**
 * Client wrapper that owns the cross-cutting state between the rail and
 * the chat surface:
 *
 *   1. `abortRef` — a single AbortController slot mirrored from ChatHome
 *      so the delete handler can tear down a live stream the moment the
 *      currently-streaming session is deleted (PR-C M22 contract).
 *
 *   2. `handleDelete` — calls the `deleteSessionAction` server action,
 *      catches the NEXT_REDIRECT thrown when the action redirects the
 *      current session away, and uses `router.refresh()` to update the
 *      rail when the deleted row was NOT the current chat.
 *
 * ChatHome is keyed by `sessionId ?? "new"` so it fully remounts (and
 * resets its local turn state) whenever the user navigates between
 * sessions or back to the greeting state.
 */
export function HomeClient({
  sessionId,
  sessions,
  greeting,
  initialTurns,
  watching,
}: HomeClientProps) {
  const router = useRouter();
  const abortRef = useRef<AbortController | null>(null);

  const handleDelete = useCallback(
    async (targetId: string) => {
      try {
        // Live-delete of the streaming session: abort the in-flight fetch
        // first so the server stops streaming AND ChatHome's catch
        // (AbortError) flips the optimistic agent turn to `aborted`
        // before we unmount via the server-side redirect.
        if (targetId === sessionId && abortRef.current) {
          abortRef.current.abort();
        }
        await deleteSessionAction(targetId, sessionId ?? undefined);
        // Non-current delete: server action revalidated /home; nudge
        // Next to actually re-fetch the RSC payload so the rail updates.
        // Current-session delete throws NEXT_REDIRECT inside
        // deleteSessionAction → control never reaches here for that case.
        if (targetId !== sessionId) {
          router.refresh();
        }
      } catch (err) {
        // NEXT_REDIRECT is how server actions communicate "the browser
        // should navigate"; rethrow so Next intercepts it.
        const digest = (err as Error & { digest?: string })?.digest;
        if (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT")) {
          throw err;
        }
        toast.error("Couldn't delete chat");
      }
    },
    [sessionId, router],
  );

  return (
    // `.home-pilot` lifted up so the design tokens + scoped CSS (including
    // the `.session-rail` styles in globals.css) wrap BOTH the rail and the
    // chat surface. With the rail mounted as a sibling of ChatHome under
    // SessionRailShell, an inner-only `.home-pilot` left the rail unstyled.
    <div className="home-pilot" data-testid="home-pilot">
      <SessionRailShell
        rail={<SessionRail sessions={sessions} currentSessionId={sessionId} />}
        onDelete={handleDelete}
      >
        <ChatHome
          key={sessionId ?? "new"}
          sessionId={sessionId}
          greeting={greeting}
          initialTurns={initialTurns}
          watching={watching}
          abortRef={abortRef}
        />
      </SessionRailShell>
    </div>
  );
}
