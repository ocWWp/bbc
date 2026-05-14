import Link from "next/link";
import { readLog, readLkg } from "@/lib/read-log";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

type PageProps = { searchParams: Promise<{ offset?: string }> };

const ACTION_COLOR: Record<string, string> = {
  accept: "ok",
  reject: "err",
  propose: "muted",
  "era-promotion": "warn",
};

export default async function LogSettingsPage({ searchParams }: PageProps) {
  const { offset: offStr } = await searchParams;
  const offset = Math.max(0, parseInt(offStr ?? "0", 10) || 0);
  const [log, lkg] = await Promise.all([readLog(), readLkg()]);
  const total = log.length;
  const sorted = log.slice().reverse();
  const page = sorted.slice(offset, offset + PAGE_SIZE);

  const nextOff = offset + PAGE_SIZE < total ? offset + PAGE_SIZE : null;
  const prevOff = offset > 0 ? Math.max(0, offset - PAGE_SIZE) : null;

  return (
    <>
      <div className="set-block">
        <div className="set-block-head">
          <div>
            <div className="h">Activity · {total} entries</div>
            <div className="sub">
              Every accept, reject, propose, and era-promotion. Lives in
              Postgres forever. Source: <code>_log/operations.jsonl</code>.
            </div>
          </div>
          <span className="pill muted">LKG v{lkg}</span>
        </div>
        {page.length === 0 ? (
          <div style={{ padding: "24px 20px" }}>
            <p style={{ color: "var(--paper-muted)", fontSize: 13.5, margin: 0 }}>
              No log entries yet.
            </p>
          </div>
        ) : (
          <div>
            {page.map((e) => (
              <div
                key={e.v}
                style={{
                  display: "grid",
                  gridTemplateColumns: "60px 150px minmax(120px, 1fr) 110px minmax(0, 2fr)",
                  gap: 14,
                  alignItems: "center",
                  padding: "10px 20px",
                  borderBottom: "1px solid var(--paper-rule)",
                  fontFamily: "var(--font-geist-mono), monospace",
                  fontSize: 12,
                }}
              >
                <span
                  style={{
                    color: "var(--paper-muted)",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  v{e.v}
                </span>
                <span
                  style={{
                    color: "var(--paper-muted)",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {e.ts.slice(5, 16).replace("T", " ")}
                </span>
                <span style={{ color: "var(--paper-ink)" }}>{e.actor}</span>
                <span className={`pill ${ACTION_COLOR[e.action] ?? "muted"}`}>
                  {e.action}
                </span>
                <code
                  style={{
                    fontSize: 11.5,
                    color: "var(--paper-ink-2)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                  title={e.target}
                >
                  {e.target}
                </code>
              </div>
            ))}
          </div>
        )}
      </div>

      <div
        style={{
          display: "flex",
          gap: 8,
          justifyContent: "space-between",
          alignItems: "center",
          marginTop: 8,
          fontFamily: "var(--font-geist-mono), monospace",
          fontSize: 11.5,
          color: "var(--paper-muted)",
        }}
      >
        <span>
          showing {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} of {total}
        </span>
        <div style={{ display: "flex", gap: 8 }}>
          {prevOff !== null && (
            <Link href={`/settings/log?offset=${prevOff}`} className="btn btn-ghost">
              ← newer
            </Link>
          )}
          {nextOff !== null && (
            <Link href={`/settings/log?offset=${nextOff}`} className="btn btn-ghost">
              older →
            </Link>
          )}
        </div>
      </div>
    </>
  );
}
