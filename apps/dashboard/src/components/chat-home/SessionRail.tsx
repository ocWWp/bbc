import Link from "next/link";
import { Plus } from "lucide-react";
import { SessionList } from "./SessionList";
import type { SessionRailItem } from "@/lib/home/sessions";

export type SessionRailProps = {
  sessions: SessionRailItem[];
  currentSessionId: string | null;
};

/**
 * Server-rendered chat-history rail. Lives inside `SessionRailShell`
 * which supplies the SessionRailContext + drawer chrome. This file
 * stays pure RSC so the session list arrives as serialized props and
 * we avoid sending list-rendering JS for the common case.
 *
 * The visible affordances are the acid-yellow "New chat" button and
 * the list below. The sr-only <h2> gives screen readers a heading to
 * land on; the new-chat button is the de-facto visible label.
 */
export function SessionRail({ sessions, currentSessionId }: SessionRailProps) {
  return (
    <aside
      role="navigation"
      aria-label="Chat history"
      className="session-rail flex h-full flex-col gap-3 p-4"
      data-testid="session-rail"
    >
      <h2 className="sr-only">Chat history</h2>

      <Link
        href="/home"
        className="session-rail-new-chat"
        data-testid="session-rail-new-chat"
      >
        <Plus size={14} aria-hidden="true" />
        <span>New chat</span>
      </Link>

      {sessions.length === 0 ? (
        <p className="session-rail-empty" data-testid="session-rail-empty">
          No chats yet. Start one to see it here.
        </p>
      ) : (
        <SessionList sessions={sessions} currentSessionId={currentSessionId} />
      )}
    </aside>
  );
}
