"use client";

import Link from "next/link";

// One cross-studio run row. Shown in the /home chat-home below the composer.
export type RecentRun = {
  id: string;
  template_id: string;
  task: string;
  status: string;
  created_at: string;
};

type Props = {
  runs: ReadonlyArray<RecentRun>;
  limit?: number;
};

const DEFAULT_LIMIT = 5;

export default function RecentRunsStrip({ runs, limit = DEFAULT_LIMIT }: Props) {
  if (runs.length === 0) return null;
  const visible = runs.slice(0, limit);
  return (
    <section className="chat-home-runs" aria-label="Recent runs">
      <span className="eyebrow">recent runs</span>
      <ul className="runs-list">
        {visible.map((r) => (
          <li key={r.id}>
            <Link href={`/studio/runs/${r.id}`} className="run-row">
              <span className="run-template mono">{r.template_id}</span>
              <span className="run-task">{r.task}</span>
              <span className={`pill muted run-status`}>{r.status}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
