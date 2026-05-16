"use client";

import { AnimatePresence } from "framer-motion";
import { SessionRow } from "./SessionRow";
import { useSessionRailContext } from "./session-rail-context";
import type { SessionRailItem } from "@/lib/home/sessions";

export type SessionListProps = {
  sessions: SessionRailItem[];
  currentSessionId: string | null;
};

/**
 * Renders the rail's list of session rows. `AnimatePresence` lets rows
 * fade-and-shrink out on delete; `initial={false}` skips the enter
 * animation for rows present on first mount (otherwise every page load
 * would replay the staggered reveal, which is jarring on a rail you
 * see all day).
 */
export function SessionList({ sessions, currentSessionId }: SessionListProps) {
  const { onDelete } = useSessionRailContext();
  return (
    <div className="session-list" data-testid="session-list">
      <AnimatePresence initial={false}>
        {sessions.map((s) => (
          <SessionRow
            key={s.id}
            session={s}
            isCurrent={s.id === currentSessionId}
            onDelete={onDelete}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}
