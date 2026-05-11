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

function statusTone(status: string): string {
  if (status === "integrated") return "text-emerald-700 dark:text-emerald-400";
  if (status === "error") return "text-rose-700 dark:text-rose-400";
  if (status === "extracted" || status === "parsed" || status === "fetched") return "text-amber-700 dark:text-amber-400";
  return "text-muted-foreground";
}

function formatBytes(n: number | null): string {
  if (!n) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

const CONNECTED_PLACEHOLDERS = [
  { name: "GitHub", note: "Pull READMEs + docs from a repo", availability: "v1.21" },
  { name: "Notion", note: "Index pages from a workspace", availability: "v1.22" },
  { name: "Linear", note: "Snapshot project + issue context", availability: "v1.23" },
  { name: "Slack", note: "Channel summaries for decisions", availability: "v1.24" },
];

export default async function SourcesPage() {
  const recent = await loadRecentSources();

  return (
    <div className="space-y-10 pb-16">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Sources</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Every brain-dump, URL fetch, or file drop becomes a source row. Each memory cites the
          sources it came from. Nothing is auto-accepted — everything passes through the queue.
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Direct</h2>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <Link
            href="/welcome"
            className="group flex items-center gap-3 rounded-xl border border-border/70 bg-card/40 px-4 py-3 transition-colors hover:bg-card/70"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted/60 text-muted-foreground group-hover:text-foreground transition-colors">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="9" y1="13" x2="15" y2="13" />
                <line x1="9" y1="17" x2="15" y2="17" />
              </svg>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium">Paste text</p>
              <p className="truncate text-[11px] text-muted-foreground">Anything from your head, 80–8,000 chars</p>
            </div>
          </Link>

          <Link
            href="/welcome"
            className="group flex items-center gap-3 rounded-xl border border-border/70 bg-card/40 px-4 py-3 transition-colors hover:bg-card/70"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted/60 text-muted-foreground group-hover:text-foreground transition-colors">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
              </svg>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium">Paste a URL</p>
              <p className="truncate text-[11px] text-muted-foreground">Public webpage, README, blog post</p>
            </div>
          </Link>

          <Link
            href="/welcome"
            className="group flex items-center gap-3 rounded-xl border border-border/70 bg-card/40 px-4 py-3 transition-colors hover:bg-card/70"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted/60 text-muted-foreground group-hover:text-foreground transition-colors">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium">Drop a file</p>
              <p className="truncate text-[11px] text-muted-foreground">.md or .txt, up to 1 MB</p>
            </div>
          </Link>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Connected</h2>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {CONNECTED_PLACEHOLDERS.map((c) => (
            <div
              key={c.name}
              aria-disabled
              className="flex items-center gap-3 rounded-xl border border-dashed border-border/50 bg-transparent px-4 py-3 opacity-70"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted/40 text-muted-foreground">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-sm font-medium">{c.name}</p>
                  <span className="rounded-full bg-muted/60 px-1.5 text-[9px] font-mono uppercase tracking-wider text-muted-foreground">
                    {c.availability}
                  </span>
                </div>
                <p className="truncate text-[11px] text-muted-foreground">{c.note}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Recent ingests
        </h2>
        {recent.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/60 bg-card/30 px-6 py-12 text-center">
            <p className="text-sm text-muted-foreground">
              Nothing here yet. Drop a source above or finish onboarding.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border/60">
            <table className="w-full text-sm">
              <thead className="border-b border-border/60 bg-muted/30 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 font-medium">Kind</th>
                  <th className="px-4 py-2 font-medium">Source</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium text-right">Size</th>
                  <th className="px-4 py-2 font-medium text-right">When</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {recent.map((row) => (
                  <tr key={row.id} className="hover:bg-muted/20">
                    <td className="px-4 py-2">
                      <span className="rounded-full bg-muted/60 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider">
                        {row.kind}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      <span className="block max-w-md truncate" title={locatorLabel(row)}>
                        {locatorLabel(row)}
                      </span>
                    </td>
                    <td className={`px-4 py-2 text-xs ${statusTone(row.status)}`}>{row.status}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">
                      {formatBytes(row.byte_size)}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">
                      {formatDate(row.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
