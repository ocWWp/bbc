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

function relativeTime(iso: string, now: number = Date.now()): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const diffSec = Math.max(0, Math.floor((now - t) / 1000));
  if (diffSec < 60) return "just now";
  if (diffSec < 3_600) return `${Math.floor(diffSec / 60)}m`;
  if (diffSec < 86_400) return `${Math.floor(diffSec / 3_600)}h`;
  if (diffSec < 86_400 * 7) return `${Math.floor(diffSec / 86_400)}d`;
  return new Date(iso).toISOString().slice(0, 10);
}

// Drop the leading "<role>:" namespace from a template_id for the visible
// label — the role is encoded by the leading-dot color, no need to repeat it.
function templateShort(templateId: string): string {
  const i = templateId.indexOf(":");
  return i >= 0 ? templateId.slice(i + 1) : templateId;
}

export default function RecentRunsStrip({ runs, limit = DEFAULT_LIMIT }: Props) {
  if (runs.length === 0) return null;
  const visible = runs.slice(0, limit);
  return (
    <section className="chat-home-runs" aria-label="Recent runs">
      <div className="chat-home-runs-head">
        <span className="eyebrow">recent runs</span>
      </div>
      <ul className="runs-list">
        {visible.map((r) => (
          <li key={r.id}>
            <Link href={`/studio/runs/${r.id}`} className="run-row">
              <span className="run-task">{r.task}</span>
              <span className="run-template mono">{templateShort(r.template_id)}</span>
              <span className={`run-status pill muted`}>{r.status.replace(/_/g, " ")}</span>
              <time
                className="run-time mono"
                dateTime={r.created_at}
                title={new Date(r.created_at).toLocaleString()}
              >
                {relativeTime(r.created_at)}
              </time>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
