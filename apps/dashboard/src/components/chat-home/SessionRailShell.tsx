"use client";

import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { PanelLeft } from "lucide-react";
import { SessionRailContext } from "./session-rail-context";

export type SessionRailShellProps = {
  /**
   * Server-rendered `<SessionRail />` element. Passed in as a slot
   * (rather than imported) so this client component can stay agnostic
   * of how the rail is composed and we don't break the RSC tree.
   */
  rail: React.ReactNode;
  /** The page body (the chat surface). */
  children: React.ReactNode;
  /** Delete callback shared with every SessionRow via context. */
  onDelete: (id: string) => void;
};

/**
 * Layout shell for the /home chat-history rail.
 *
 * Desktop (>= md): inline 260px rail + chat column.
 * Mobile (< md):   rail is off-canvas; a hamburger toggle opens a
 *                  spring-driven drawer with a scrim behind it.
 *
 * The drawer auto-closes when the route (pathname or `?session=`)
 * changes — i.e. as soon as the user picks a row, the chat surface
 * becomes visible without a second tap.
 */
export function SessionRailShell({
  rail,
  children,
  onDelete,
}: SessionRailShellProps) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const search = useSearchParams();
  const sessionParam = search?.get("session") ?? null;

  // Close the drawer whenever the route changes. We listen on both
  // pathname and the `?session=` query so picking a row inside the
  // drawer closes it even though pathname stays `/home`.
  useEffect(() => {
    setOpen(false);
  }, [pathname, sessionParam]);

  // ESC closes the drawer when it's open. Only mount the listener
  // while open so we don't intercept Escape on the chat surface.
  useEffect(() => {
    if (!open) return;
    const handler = (evt: KeyboardEvent) => {
      if (evt.key === "Escape") {
        setOpen(false);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  return (
    <SessionRailContext.Provider value={{ onDelete }}>
      <div
        className="session-shell grid min-h-screen grid-cols-1 md:grid-cols-[260px_1fr]"
        data-testid="session-shell"
      >
        {/* Desktop rail — always mounted on md+ so the RSC tree stays
            stable across route changes. */}
        <div className="hidden border-r border-[var(--home-rule)] bg-[var(--home-bg)] md:block">
          {rail}
        </div>

        {/* Mobile drawer — scrim + slide-in aside. AnimatePresence
            handles the exit animation when `open` flips back to false. */}
        <AnimatePresence>
          {open && (
            <>
              <motion.div
                className="fixed inset-0 z-30 md:hidden"
                style={{ background: "rgba(21, 20, 15, 0.40)" }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                onClick={() => setOpen(false)}
                aria-hidden="true"
                data-testid="session-rail-scrim"
              />
              <motion.aside
                id="session-rail-drawer"
                role="dialog"
                aria-label="Chat history"
                aria-modal="true"
                className="fixed top-0 left-0 z-40 h-screen overflow-y-auto border-r border-[var(--home-rule)] bg-[var(--home-bg)] md:hidden"
                style={{ width: "min(85vw, 320px)" }}
                initial={{ x: "-100%" }}
                animate={{ x: 0 }}
                exit={{ x: "-100%" }}
                transition={{ type: "spring", stiffness: 320, damping: 30 }}
                data-testid="session-rail-drawer"
              >
                {rail}
              </motion.aside>
            </>
          )}
        </AnimatePresence>

        {/* Chat column. `relative` so the absolutely-positioned mobile
            toggle sits inside it, not over the rail on desktop. */}
        <main className="relative overflow-auto" data-testid="session-shell-main">
          {/* Mobile hamburger — absolute top-left of the chat column,
              so it sits inside <main>'s relative positioning context
              (below the sticky app-nav header) rather than over it. */}
          <button
            type="button"
            aria-label="Open chat history"
            aria-expanded={open}
            aria-controls="session-rail-drawer"
            onClick={() => setOpen(true)}
            className="session-rail-toggle md:hidden"
            data-testid="session-rail-toggle"
          >
            <PanelLeft size={18} aria-hidden="true" />
          </button>
          {children}
        </main>
      </div>
    </SessionRailContext.Provider>
  );
}
