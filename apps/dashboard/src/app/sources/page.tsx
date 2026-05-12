import Link from "next/link";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type IngestionSourceRow = {
  id: string;
  kind: "text" | "url" | "file";
  status: string;
  locator: Record<string, unknown> | null;
  byte_size: number | null;
  created_at: string;
};

async function loadRecentSources(): Promise<IngestionSourceRow[]> {
  const supabase = await getSupabaseServerClient();
  const { data } = await supabase
    .from("ingestion_sources")
    .select("id, kind, status, locator, byte_size, created_at")
    .order("created_at", { ascending: false })
    .limit(50);
  return (data as IngestionSourceRow[] | null) ?? [];
}

function locatorLabel(row: IngestionSourceRow): string {
  const loc = row.locator ?? {};
  if (row.kind === "url" && typeof loc.href === "string") return loc.href;
  if (row.kind === "file" && typeof loc.filename === "string") return loc.filename;
  if (row.kind === "text") return "(direct paste)";
  return "—";
}

const STATUS_PILL: Record<string, "ok" | "err" | "warn" | "muted"> = {
  integrated: "ok",
  error: "err",
  extracted: "warn",
  parsed: "warn",
  fetched: "warn",
};

function formatBytes(n: number | null): string {
  if (!n) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

const CONNECTED_PLACEHOLDERS = [
  { name: "GitHub", note: "Pull READMEs + docs from a repo", availability: "v1.21" },
  { name: "Notion", note: "Index pages from a workspace", availability: "v1.22" },
  { name: "Linear", note: "Snapshot project + issue context", availability: "v1.23" },
  { name: "Slack", note: "Channel summaries for decisions", availability: "v1.24" },
];

const ICON = {
  text: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="9" y1="13" x2="15" y2="13" />
      <line x1="9" y1="17" x2="15" y2="17" />
    </svg>
  ),
  url: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  ),
  file: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  ),
  lock: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  ),
};

const DIRECT_OPTIONS = [
  { key: "text" as const, title: "Paste text", note: "Anything from your head, 80–8,000 chars" },
  { key: "url" as const, title: "Paste a URL", note: "Public webpage, README, blog post" },
  { key: "file" as const, title: "Drop a file", note: ".md or .txt, up to 1 MB" },
];

export default async function SourcesPage() {
  const recent = await loadRecentSources();

  return (
    <div className="container page">
      <header className="page-head">
        <div className="page-head-left">
          <div className="page-crumb">
            <Link href="/queue">acme</Link>
            <span className="sep">/</span>
            <span className="current">sources</span>
          </div>
          <h1 className="page-title">sources</h1>
          <p className="page-blurb">
            Every brain-dump, URL fetch, or file drop becomes a source row.
            Each memory cites the sources it came from. Nothing is
            auto-accepted: every source still passes through the queue.
          </p>
        </div>
      </header>

      <div className="set-section">
        <div className="set-block">
          <div className="set-block-head">
            <div>
              <div className="h">Direct · {DIRECT_OPTIONS.length}</div>
              <div className="sub">
                Paste, link, or drop right into the queue.
              </div>
            </div>
          </div>
          <div className="type-pick-grid" style={{ padding: 16 }}>
            {DIRECT_OPTIONS.map((o) => (
              <Link
                key={o.key}
                href="/welcome"
                className="type-pick-card"
                style={{ ["--role-color" as string]: "var(--paper-accent)" }}
              >
                <span className="role-glyph" aria-hidden>
                  {ICON[o.key]}
                </span>
                <div className="type-pick-meta">
                  <div className="type-pick-name">{o.title}</div>
                  <div className="type-pick-hint">{o.note}</div>
                </div>
                <span className="type-pick-arrow">→</span>
              </Link>
            ))}
          </div>
        </div>

        <div className="set-block">
          <div className="set-block-head">
            <div>
              <div className="h">Connected · {CONNECTED_PLACEHOLDERS.length}</div>
              <div className="sub">
                Pull from external systems. Coming in upcoming releases —
                the version pill marks the target.
              </div>
            </div>
          </div>
          <div className="type-pick-grid" style={{ padding: 16 }}>
            {CONNECTED_PLACEHOLDERS.map((c) => (
              <div
                key={c.name}
                aria-disabled
                className="type-pick-card"
                style={{
                  cursor: "not-allowed",
                  opacity: 0.55,
                  borderStyle: "dashed",
                }}
              >
                <span
                  className="role-glyph"
                  aria-hidden
                  style={{
                    color: "var(--paper-muted)",
                    background: "var(--paper-bg-2)",
                    borderColor: "var(--paper-rule)",
                  }}
                >
                  {ICON.lock}
                </span>
                <div className="type-pick-meta">
                  <div className="type-pick-name">{c.name}</div>
                  <div className="type-pick-hint">{c.note}</div>
                </div>
                <span className="pill muted" style={{ fontSize: 10 }}>
                  {c.availability}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="set-block">
          <div className="set-block-head">
            <div>
              <div className="h">Recent ingests · {recent.length}</div>
              <div className="sub">
                Newest first. Source:{" "}
                <code>ingestion_sources</code> (tenant-scoped).
              </div>
            </div>
          </div>
          {recent.length === 0 ? (
            <div style={{ padding: "32px 20px", textAlign: "center" }}>
              <p style={{ color: "var(--paper-muted)", fontSize: 13.5, margin: 0 }}>
                Nothing here yet. Drop a source above or finish onboarding.
              </p>
            </div>
          ) : (
            <div>
              {recent.map((row) => (
                <div
                  key={row.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "70px minmax(120px, 1fr) 110px 90px 130px",
                    gap: 14,
                    alignItems: "center",
                    padding: "12px 20px",
                    borderBottom: "1px solid var(--paper-rule)",
                    fontSize: 12.5,
                  }}
                >
                  <span
                    className="pill muted"
                    style={{
                      fontFamily: "var(--font-geist-mono), monospace",
                      fontSize: 10.5,
                      textTransform: "lowercase",
                      justifySelf: "start",
                    }}
                  >
                    {row.kind}
                  </span>
                  <code
                    style={{
                      fontFamily: "var(--font-geist-mono), monospace",
                      fontSize: 12,
                      color: "var(--paper-ink-2)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                    title={locatorLabel(row)}
                  >
                    {locatorLabel(row)}
                  </code>
                  <span
                    className={`pill ${STATUS_PILL[row.status] ?? "muted"}`}
                    style={{ justifySelf: "start" }}
                  >
                    {row.status}
                  </span>
                  <span
                    className="mono"
                    style={{
                      fontSize: 11,
                      color: "var(--paper-muted)",
                      fontVariantNumeric: "tabular-nums",
                      justifySelf: "end",
                    }}
                  >
                    {formatBytes(row.byte_size)}
                  </span>
                  <span
                    className="mono"
                    style={{
                      fontSize: 11,
                      color: "var(--paper-muted)",
                      fontVariantNumeric: "tabular-nums",
                      justifySelf: "end",
                    }}
                  >
                    {row.created_at.slice(5, 16).replace("T", " ")}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
