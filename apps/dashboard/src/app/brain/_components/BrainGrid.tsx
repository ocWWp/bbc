import Link from "next/link";
import { SUPERTAGS, type Supertag } from "@/lib/memory/types";

export type BrainItem = {
  id: string;
  type: string;
  title: string;
  slug: string | null;
  status: string;
  updated_at: string | null;
  fields: Record<string, unknown> | null;
};

export type BrainGridProps = {
  items: ReadonlyArray<BrainItem>;
  /** Total across all types — used for the "all" chip count. */
  totalCount: number;
  /** Per-supertag counts for the filter chips. */
  counts: Record<string, number>;
  /** Currently-active supertag filter (?type=...). */
  activeType?: Supertag;
  /** Currently-active text filter (?q=...). */
  query?: string;
};

function relDate(iso: string | null): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "—";
  return new Date(t).toISOString().slice(0, 10);
}

/**
 * Read-only counterpart to /memory. Members land here; operators+ are
 * redirected from /brain → /memory by the page guard. There are no edit
 * affordances in this component; the *security* of /brain is the
 * operator-only requireRole on every mutating action in
 * apps/dashboard/src/app/memory/actions.ts (covered by actions.rbac.test.ts).
 */
export function BrainGrid({ items, totalCount, counts, activeType, query }: BrainGridProps) {
  return (
    <div className="container page">
      <header className="page-head">
        <div className="page-head-left">
          <div className="page-crumb">
            <span className="current">brain</span>
          </div>
          <h1 className="page-title">
            brain <span className="serif">— {totalCount} rows across nine types</span>
          </h1>
          <p className="page-blurb">
            Your tenant&apos;s memory, read-only. Click any row to view the full record.
            To suggest a change, open the row and use <em>Flag this</em>.
          </p>
        </div>
      </header>

      <div className="mem-filters">
        <div className="chips">
          <Link
            href="/brain"
            className={`px-chip ${!activeType ? "is-on" : ""}`}
            style={{ ["--tag-color" as string]: "var(--paper-ink)" }}
          >
            <span className="px-chip-dot" />
            all
            <span className="px-chip-count">{totalCount}</span>
          </Link>
          {SUPERTAGS.map((t) => {
            const isOn = activeType === t;
            return (
              <Link
                key={t}
                href={isOn ? "/brain" : `/brain?type=${t}`}
                className={`px-chip ${isOn ? "is-on" : ""}`}
                style={{ ["--tag-color" as string]: `var(--t-${t})` }}
              >
                <span className="px-chip-dot" />
                {t}
                <span className="px-chip-count">{counts[t] ?? 0}</span>
              </Link>
            );
          })}
        </div>
        <span className="divider" />
        <form action="/brain" method="get" style={{ display: "contents" }}>
          {activeType && <input type="hidden" name="type" value={activeType} />}
          <input
            type="text"
            name="q"
            placeholder="filter title or id…"
            defaultValue={query ?? ""}
            className="app-search"
            aria-label="filter brain"
            style={{
              minWidth: 240,
              background: "var(--paper-bg)",
              border: "1px solid var(--paper-rule)",
              borderRadius: 7,
              height: 32,
              padding: "0 10px",
              fontFamily: "var(--font-geist-mono), monospace",
              fontSize: 12,
              color: "var(--paper-ink)",
            }}
          />
        </form>
      </div>

      <div className="mem-list" data-testid="brain-grid">
        <div className="mem-list-head">
          <span>id</span>
          <span>title</span>
          <span className="fields-h">fields</span>
          <span className="date-h">updated</span>
          <span style={{ justifySelf: "end" }}>status</span>
        </div>
        {items.length === 0 ? (
          <div
            style={{
              padding: "48px 20px",
              textAlign: "center",
              color: "var(--paper-muted)",
              fontFamily: "var(--font-geist-mono), monospace",
              fontSize: 12,
            }}
          >
            no rows match these filters.{" "}
            <Link href="/brain" style={{ color: "var(--paper-accent)" }}>
              clear
            </Link>
          </div>
        ) : (
          items.map((row) => {
            const fields = row.fields ?? {};
            const entries = Object.entries(fields).slice(0, 3);
            return (
              <Link
                key={row.id}
                href={`/brain/${row.id}`}
                className="mem-row"
                data-testid="brain-row"
              >
                <div className="id-cell">
                  <span
                    className="tag"
                    style={{ ["--tag-color" as string]: `var(--t-${row.type})` }}
                  >
                    <span className="dot" />
                    {row.type}
                  </span>
                </div>
                <div className="title-cell">{row.title}</div>
                <div className="fields-cell">
                  {entries.map(([k, v], i) => (
                    <span key={k}>
                      <span className="k">{k}:</span>{" "}
                      <span className="v">
                        {typeof v === "string" || typeof v === "number" ? String(v) : "—"}
                      </span>
                      {i < entries.length - 1 && (
                        <span style={{ color: "var(--paper-rule-2)", marginLeft: 6 }}>·</span>
                      )}
                    </span>
                  ))}
                </div>
                <div className="date-cell">{relDate(row.updated_at)}</div>
                <div className="status-cell">
                  {row.status === "draft" ? (
                    <span className="pill warn">
                      <span className="dot" /> draft
                    </span>
                  ) : row.status === "archived" ? (
                    <span className="pill muted">
                      <span className="dot" /> archived
                    </span>
                  ) : (
                    <span className="pill ok">
                      <span className="dot" /> active
                    </span>
                  )}
                </div>
              </Link>
            );
          })
        )}
      </div>

      <div
        style={{
          marginTop: 14,
          fontFamily: "var(--font-geist-mono), monospace",
          fontSize: 11.5,
          color: "var(--paper-muted)",
          display: "flex",
          justifyContent: "space-between",
        }}
      >
        <span>
          showing {items.length} of {totalCount}
        </span>
        <span>postgres · RLS active · read-only</span>
      </div>
    </div>
  );
}
