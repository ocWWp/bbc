import Link from "next/link";
import type { RecentDraft } from "@/lib/studio/read-recent-drafts";

export type RecentDraftsProps = {
  items: ReadonlyArray<RecentDraft>;
  /** Path each draft's title links to, given the draft id. Defaults to /studio/runs/<id>. */
  hrefFor?: (id: string) => string;
  emptyLabel?: string;
};

function relTime(iso: string | null): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "—";
  const diffSec = (Date.now() - t) / 1000;
  if (diffSec < 60) return "just now";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  if (diffSec < 86400 * 7) return `${Math.floor(diffSec / 86400)}d ago`;
  return new Date(t).toISOString().slice(0, 10);
}

function statusPillClass(status: string): string {
  switch (status) {
    case "accepted":
      return "pill ok";
    case "rejected":
      return "pill muted";
    case "error":
      return "pill danger";
    case "running":
    case "pending_review":
      return "pill warn";
    default:
      return "pill";
  }
}

/**
 * Task 20: Recent drafts list. Pure render — server fetches via
 * readRecentDrafts() and passes items in. Each Studio's existing client
 * places this in StudioShell's recentDraftsSlot.
 */
export function RecentDrafts({
  items,
  hrefFor = (id) => `/studio/runs/${id}`,
  emptyLabel = "No drafts yet. Generate something above.",
}: RecentDraftsProps) {
  if (items.length === 0) {
    return (
      <div className="studio-drafts-empty" data-testid="recent-drafts-empty">
        {emptyLabel}
      </div>
    );
  }

  return (
    <ul className="studio-drafts-list" data-testid="recent-drafts-list">
      {items.map((d) => (
        <li key={d.id} className="studio-drafts-item">
          <Link href={hrefFor(d.id)} className="studio-drafts-link">
            <span className="studio-drafts-title">{d.title}</span>
            <span className="studio-drafts-meta">
              <span className="studio-drafts-template mono">{d.templateSlug}</span>
              <span className="studio-drafts-time mono">{relTime(d.createdAt)}</span>
              <span className={statusPillClass(d.status)}>
                <span className="dot" /> {d.status.replace(/_/g, " ")}
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
