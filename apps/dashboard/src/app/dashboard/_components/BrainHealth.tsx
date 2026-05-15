import Link from "next/link";
import type { BrainHealth as BrainHealthData } from "@/lib/home/read-brain-health";

function relTime(iso: string | null): string {
  if (!iso) return "never";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "—";
  const diffSec = (Date.now() - t) / 1000;
  if (diffSec < 60) return "just now";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86_400) return `${Math.floor(diffSec / 3600)}h ago`;
  return `${Math.floor(diffSec / 86_400)}d ago`;
}

export function BrainHealth({ data }: { data: BrainHealthData }) {
  return (
    <section className="home-card" data-testid="brain-health">
      <header className="home-card-head">
        <h2 className="home-card-title">Brain</h2>
        <Link href="/memory" className="home-card-link">
          open →
        </Link>
      </header>
      <div className="home-card-stats">
        <div className="home-stat">
          <span className="home-stat-n">{data.totalMemories}</span>
          <span className="home-stat-label">memories</span>
        </div>
        <div className="home-stat">
          <Link href="/queue" className="home-stat-n">
            {data.awaitingReview}
          </Link>
          <span className="home-stat-label">awaiting review</span>
        </div>
        <div className="home-stat">
          <span className="home-stat-n">{relTime(data.lastSeedAt)}</span>
          <span className="home-stat-label">last seed</span>
        </div>
      </div>
      <div className="home-card-foot">
        {(Object.entries(data.byType) as Array<[string, number]>)
          .filter(([, n]) => n > 0)
          .sort(([, a], [, b]) => b - a)
          .slice(0, 5)
          .map(([tag, n]) => (
            <Link
              key={tag}
              href={`/memory?type=${tag}`}
              className="home-tag-pill"
              style={{ ["--tag-color" as string]: `var(--t-${tag})` }}
            >
              <span className="dot" />
              {tag}
              <span className="n">{n}</span>
            </Link>
          ))}
      </div>
    </section>
  );
}
