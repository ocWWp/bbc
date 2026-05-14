"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { InboxItem } from "@/lib/inbox/read-inbox";

export type InboxBellProps = {
  /** Unread count for the from_bbc channel only (mentions excluded by design). */
  unreadCount: number;
  /** Top N from_bbc items to render in the slide-out (server-pre-loaded). */
  preview: ReadonlyArray<InboxItem>;
};

function relTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "—";
  const diffSec = (Date.now() - t) / 1000;
  if (diffSec < 60) return "now";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m`;
  if (diffSec < 86_400) return `${Math.floor(diffSec / 3600)}h`;
  return `${Math.floor(diffSec / 86_400)}d`;
}

function hrefFor(item: InboxItem): string {
  if (item.source_kind === "queue_item" && item.source_queue_item_id) {
    return `/queue/${item.source_queue_item_id}`;
  }
  if (item.source_kind === "memory_file" && item.source_memory_id) {
    return `/brain/${item.source_memory_id}`;
  }
  return "/inbox";
}

/**
 * Task 31: bell + slide-out in the primary nav. The badge counts only
 * from_bbc unread — mentions has no producer in v1.5 and must not
 * generate badge noise (Task 30's read-inbox already excludes it from
 * from_bbc_unread).
 */
export function InboxBell({ unreadCount, preview }: InboxBellProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="inbox-bell-wrap" ref={wrapRef}>
      <button
        type="button"
        className="inbox-bell"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Inbox${unreadCount > 0 ? ` — ${unreadCount} unread` : ""}`}
        data-testid="inbox-bell"
        onClick={() => setOpen((o) => !o)}
      >
        <BellIcon />
        {unreadCount > 0 ? (
          <span className="inbox-bell-badge" data-testid="inbox-bell-badge">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        ) : null}
      </button>
      {open && (
        <div className="inbox-slide-out" role="dialog" aria-label="Inbox preview">
          <header className="inbox-slide-head">
            <span>Inbox</span>
            <Link href="/inbox" className="inbox-slide-all" onClick={() => setOpen(false)}>
              See all →
            </Link>
          </header>
          {preview.length === 0 ? (
            <p className="inbox-slide-empty">No unread notifications.</p>
          ) : (
            <ul className="inbox-slide-list">
              {preview.map((item) => (
                <li
                  key={item.id}
                  className={`inbox-slide-row ${item.read_at ? "is-read" : "is-unread"}`}
                >
                  <Link
                    href={hrefFor(item)}
                    className="inbox-slide-link"
                    onClick={() => setOpen(false)}
                  >
                    <span className="inbox-slide-title">{item.title}</span>
                    <span className="inbox-slide-time mono">{relTime(item.created_at)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function BellIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M3.5 12V8a4.5 4.5 0 0 1 9 0v4l1 1.5h-11L3.5 12z" />
      <path d="M6.5 14a1.5 1.5 0 0 0 3 0" />
    </svg>
  );
}
