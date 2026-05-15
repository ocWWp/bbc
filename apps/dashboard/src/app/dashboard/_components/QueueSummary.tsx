import Link from "next/link";
import type { QueueSummary as QueueSummaryData } from "@/lib/home/read-queue-summary";

function relTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "—";
  const diffSec = (Date.now() - t) / 1000;
  if (diffSec < 60) return "just now";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m`;
  if (diffSec < 86_400) return `${Math.floor(diffSec / 3600)}h`;
  return `${Math.floor(diffSec / 86_400)}d`;
}

export function QueueSummary({ data }: { data: QueueSummaryData }) {
  if (data.pendingCount === 0) {
    return (
      <section className="home-card" data-testid="queue-summary">
        <header className="home-card-head">
          <h2 className="home-card-title">Queue</h2>
          <Link href="/queue" className="home-card-link">
            open →
          </Link>
        </header>
        <p className="home-card-empty">No pending proposals. Inbox zero.</p>
      </section>
    );
  }

  return (
    <section className="home-card" data-testid="queue-summary">
      <header className="home-card-head">
        <h2 className="home-card-title">
          Queue <span className="home-card-badge">{data.pendingCount}</span>
        </h2>
        <Link href="/queue" className="home-card-link">
          see all ({data.pendingCount}) →
        </Link>
      </header>
      <ul className="home-queue-list">
        {data.topPending.map((item) => (
          <li key={item.id} className="home-queue-row">
            <Link href={`/queue/${item.proposal_id}`} className="home-queue-link">
              <span className="home-queue-kind mono">{item.change_kind}</span>
              <span className="home-queue-summary">{item.summary || item.target_file}</span>
              <span className="home-queue-time mono">{relTime(item.created_at)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
