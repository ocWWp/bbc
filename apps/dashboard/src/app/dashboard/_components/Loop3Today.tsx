import Link from "next/link";
import type { PendingRec } from "@/lib/loop3/read-recommendations";

export type Loop3TodayProps = {
  items: ReadonlyArray<PendingRec>;
};

/**
 * Top 3 pending recommendations from the W4 recommender. Once Phase M.1
 * ships full Loop 3, swap the data source upstream. RLS already gates
 * visibility — readPendingRecommendations runs in the page's server scope
 * with the actor's tenant.
 */
export function Loop3Today({ items }: Loop3TodayProps) {
  const top3 = items.slice(0, 3);

  return (
    <section className="home-card" data-testid="loop3-today">
      <header className="home-card-head">
        <h2 className="home-card-title">Loop 3 today</h2>
        <Link href="/library?recommended=1" className="home-card-link">
          see all →
        </Link>
      </header>
      {top3.length === 0 ? (
        <p className="home-card-empty">No suggestions today.</p>
      ) : (
        <ul className="home-loop3-list">
          {top3.map((r) => (
            <li key={r.id} className="home-loop3-row">
              <span className="home-loop3-kind mono">{r.target_kind}</span>
              <span className="home-loop3-target">{r.target_id}</span>
              <span className="home-loop3-reason">{r.reason_human}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
