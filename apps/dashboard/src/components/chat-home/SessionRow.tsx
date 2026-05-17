"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { MoreHorizontal } from "lucide-react";
import { motion } from "framer-motion";

export type SessionRowProps = {
  session: { id: string; title: string; last_activity_at: string };
  isCurrent: boolean;
  onDelete: (id: string) => void;
};

/**
 * One row in the chat-history rail. Renders the session title as a link
 * to `/home?session=<id>`, plus a kebab that opens a small Delete/Cancel
 * popover. Visual states (default / hover / current) are driven by data
 * attributes so we can keep all token references in one place.
 *
 * The kebab is `opacity:0` on desktop, surfaces on hover/focus/open, and
 * is always visible on touch via `@media (hover: none)` — see the
 * `.session-row-kebab` block in globals.css.
 */
export function SessionRow({ session, isCurrent, onDelete }: SessionRowProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const deleteBtnRef = useRef<HTMLButtonElement | null>(null);
  const cancelBtnRef = useRef<HTMLButtonElement | null>(null);

  // Close on outside-click. We attach on the *container* (so clicks
  // inside the popover are kept) and listen at document level.
  useEffect(() => {
    if (!open) return;
    function onDocPointer(e: PointerEvent) {
      const el = containerRef.current;
      if (!el) return;
      if (e.target instanceof Node && !el.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", onDocPointer);
    return () => document.removeEventListener("pointerdown", onDocPointer);
  }, [open]);

  // Move initial focus to Delete when the popover opens — gives the
  // user keyboard reach without first having to tab in.
  useEffect(() => {
    if (open) deleteBtnRef.current?.focus();
  }, [open]);

  const onPopoverKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      return;
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      // Two items only — toggle between them.
      const active = document.activeElement;
      if (active === deleteBtnRef.current) cancelBtnRef.current?.focus();
      else deleteBtnRef.current?.focus();
    }
  }, []);

  const handleDelete = useCallback(() => {
    setOpen(false);
    onDelete(session.id);
  }, [onDelete, session.id]);

  return (
    <motion.div
      ref={containerRef}
      data-testid={`session-row-${session.id}`}
      data-current={isCurrent ? "true" : undefined}
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.15 }}
      className="session-row group relative"
    >
      <Link
        href={`/home?session=${session.id}`}
        className="session-row-link block pr-7"
        title={session.title}
      >
        <span className="session-row-title">{session.title}</span>
      </Link>

      <button
        type="button"
        aria-label={`More actions for ${session.title}`}
        aria-haspopup="menu"
        aria-expanded={open}
        data-popover-open={open ? "true" : undefined}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="session-row-kebab"
      >
        <MoreHorizontal size={14} aria-hidden="true" />
      </button>

      {open && (
        <div
          role="menu"
          aria-label={`Actions for ${session.title}`}
          onKeyDown={onPopoverKeyDown}
          className="session-row-popover"
        >
          <button
            ref={deleteBtnRef}
            type="button"
            role="menuitem"
            onClick={handleDelete}
            data-testid={`session-row-delete-${session.id}`}
            className="session-row-popover-item session-row-popover-item--danger"
          >
            Delete
          </button>
          <button
            ref={cancelBtnRef}
            type="button"
            role="menuitem"
            onClick={() => setOpen(false)}
            data-testid={`session-row-cancel-${session.id}`}
            className="session-row-popover-item session-row-popover-item--muted"
          >
            Cancel
          </button>
        </div>
      )}
    </motion.div>
  );
}
