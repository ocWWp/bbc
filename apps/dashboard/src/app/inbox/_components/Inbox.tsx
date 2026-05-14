"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { InboxItem, InboxView } from "@/lib/inbox/read-inbox";
import { markInboxItemRead } from "@/lib/inbox/mark-read";

function relTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "—";
  const diffSec = (Date.now() - t) / 1000;
  if (diffSec < 60) return "just now";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86_400) return `${Math.floor(diffSec / 3600)}h ago`;
  if (diffSec < 86_400 * 7) return `${Math.floor(diffSec / 86_400)}d ago`;
  return new Date(t).toISOString().slice(0, 10);
}

function hrefFor(item: InboxItem): string | null {
  if (item.source_kind === "queue_item" && item.source_queue_item_id) {
    return `/queue/${item.source_queue_item_id}`;
  }
  if (item.source_kind === "memory_file" && item.source_memory_id) {
    return `/brain/${item.source_memory_id}`;
  }
  if (item.source_kind === "recommendation") {
    return "/marketplace";
  }
  return null;
}

export function Inbox({ view }: { view: InboxView }) {
  const [tab, setTab] = useState<"from_bbc" | "mentions">("from_bbc");
  const [, startTransition] = useTransition();
  const router = useRouter();

  const items = tab === "from_bbc" ? view.from_bbc : view.mentions;
  const showMentionsTab = view.mentions_visible;

  function handleClick(item: InboxItem, e: React.MouseEvent) {
    if (item.read_at) return; // already read, just navigate
    e.preventDefault();
    startTransition(async () => {
      const fd = new FormData();
      fd.append("id", item.id);
      const res = await markInboxItemRead(fd);
      // Always navigate; mark-read failure is non-blocking for the click.
      void res;
      const href = hrefFor(item);
      if (href) router.push(href);
      else router.refresh();
    });
  }

  return (
    <div className="container page inbox-page" data-testid="inbox-page">
      <header className="page-head">
        <div className="page-head-left">
          <div className="page-crumb">
            <span className="current">inbox</span>
          </div>
          <h1 className="page-title">
            inbox{" "}
            <span className="serif">
              — {view.from_bbc_unread} unread
            </span>
          </h1>
          <p className="page-blurb">
            Resolutions from admins and suggestions surfaced for you. Click an item
            to jump to its source — it&apos;s marked read automatically.
          </p>
        </div>
      </header>

      <nav className="inbox-tabs seg" aria-label="inbox channels">
        <button
          type="button"
          className={tab === "from_bbc" ? "is-active" : ""}
          onClick={() => setTab("from_bbc")}
          data-testid="inbox-tab-from-bbc"
        >
          From BBC
          {view.from_bbc_unread > 0 && (
            <span className="badge">{view.from_bbc_unread}</span>
          )}
        </button>
        {showMentionsTab && (
          <button
            type="button"
            className={tab === "mentions" ? "is-active" : ""}
            onClick={() => setTab("mentions")}
            data-testid="inbox-tab-mentions"
          >
            Mentions
          </button>
        )}
      </nav>

      {items.length === 0 ? (
        <div className="inbox-empty" data-testid="inbox-empty">
          {tab === "from_bbc"
            ? "No notifications. You'll see flag resolutions + Loop-3 suggestions here."
            : "No mentions."}
        </div>
      ) : (
        <ul className="inbox-list" data-testid="inbox-list">
          {items.map((item) => {
            const href = hrefFor(item) ?? "#";
            return (
              <li
                key={item.id}
                className={`inbox-row ${item.read_at ? "is-read" : "is-unread"}`}
                data-testid="inbox-row"
                data-read={item.read_at ? "true" : "false"}
              >
                <Link href={href} className="inbox-link" onClick={(e) => handleClick(item, e)}>
                  <span className="inbox-kind mono">{item.kind.replace(/_/g, " ")}</span>
                  <span className="inbox-title">{item.title}</span>
                  {item.body && <span className="inbox-body">{item.body}</span>}
                  <span className="inbox-time mono">{relTime(item.created_at)}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
