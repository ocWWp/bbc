"use client";

// BrainResults: renders source-backed hits from searchBrain on /home when the
// user submitted with "Ask brain" intent. NO synthesis, NO citations beyond a
// click-through to the memory file itself — the user inspects the source.

import Link from "next/link";
import type { BrainHit } from "@/lib/home/search-brain-action";

function relativeTime(iso: string, now: number = Date.now()): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const diff = Math.max(0, Math.floor((now - t) / 1000));
  if (diff < 60) return "just now";
  if (diff < 3_600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86_400) return `${Math.floor(diff / 3_600)}h`;
  if (diff < 86_400 * 7) return `${Math.floor(diff / 86_400)}d`;
  return new Date(iso).toISOString().slice(0, 10);
}

type Props = {
  query: string;
  hits: ReadonlyArray<BrainHit>;
  onReset: () => void;
};

export default function BrainResults({ query, hits, onReset }: Props) {
  if (hits.length === 0) {
    return (
      <section className="brain-results" aria-live="polite">
        <header className="brain-results-head">
          <span className="eyebrow">
            no matches for &ldquo;{query}&rdquo;
          </span>
          <button type="button" className="link-quiet" onClick={onReset}>
            ← new search
          </button>
        </header>
        <div className="brain-results-empty">
          <p>
            BBC didn&apos;t find anything in your brain that mentions that. Try different
            words, or add the memory you&apos;re looking for.
          </p>
          <Link href="/brain" className="btn btn-ghost">
            open brain →
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="brain-results" aria-live="polite">
      <header className="brain-results-head">
        <span className="eyebrow">
          {hits.length} match{hits.length === 1 ? "" : "es"} in your brain
        </span>
        <button type="button" className="link-quiet" onClick={onReset}>
          ← new search
        </button>
      </header>
      <ul className="brain-results-list">
        {hits.map((h) => (
          <li key={h.id}>
            <Link
              href={`/brain/${h.id}`}
              className="brain-hit"
              data-type={h.type ?? "memory"}
            >
              <span className="brain-hit-type mono">{h.type ?? "memory"}</span>
              <span className="brain-hit-title">{h.title}</span>
              <time
                className="brain-hit-time mono"
                dateTime={h.updated_at}
                title={new Date(h.updated_at).toLocaleString()}
              >
                {relativeTime(h.updated_at)}
              </time>
            </Link>
          </li>
        ))}
      </ul>
      <p className="brain-results-foot">
        Found via deterministic keyword search over your brain. Click any hit to read the
        source.
      </p>
    </section>
  );
}
