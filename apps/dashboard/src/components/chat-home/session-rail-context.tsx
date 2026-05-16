"use client";

import { createContext, useContext } from "react";

/**
 * Context carrying the rail-level callbacks shared by every SessionRow.
 * Provided by `SessionRailShell` so the server-rendered `SessionRail`
 * can pass down a serializable session list without each row needing
 * to hold a client-side handler reference.
 */
type SessionRailCtx = {
  onDelete: (id: string) => void;
};

export const SessionRailContext = createContext<SessionRailCtx | null>(null);

export function useSessionRailContext(): SessionRailCtx {
  const ctx = useContext(SessionRailContext);
  if (!ctx) {
    throw new Error(
      "useSessionRailContext used outside <SessionRailContext.Provider>",
    );
  }
  return ctx;
}
