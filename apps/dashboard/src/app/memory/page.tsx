import Link from "next/link";
import { listMemoryItems } from "./queries";
import { SUPERTAGS, supertagMeta, type Supertag } from "@/lib/memory/types";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ type?: string; q?: string; view?: string }>;

function relDate(iso: string | null): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "—";
  return new Date(t).toISOString().slice(0, 10);
}

export default async function MemoryIndex({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const activeType = (SUPERTAGS as readonly string[]).includes(sp.type ?? "")
    ? (sp.type as Supertag)
    : undefined;
  const view = sp.view === "brain" ? "brain" : "list";
  const items = await listMemoryItems({ type: activeType, q: sp.q });

  // Build per-type counts for the filter chips.
  const allItems = await listMemoryItems({ q: sp.q });
  const counts: Record<string, number> = {};
  for (const t of SUPERTAGS) counts[t] = 0;
  for (const it of allItems) {
    const t = (it as { type?: string }).type;
    if (t && t in counts) counts[t] += 1;
  }

  return (
    <div className="container page">
      <header className="page-head">
        <div className="page-head-left">
          <div className="page-crumb">
            <Link href="/queue">acme</Link>
            <span className="sep">/</span>
            <span className="current">memory</span>
          </div>
          <h1 className="page-title">
            memory <span className="serif">— {allItems.length} rows across nine types</span>
          </h1>
          <p className="page-blurb">
            The brain. Every row is one typed fact, one canonical definition, or one
            decision. Edit by hand or let a studio file a proposal.
          </p>
        </div>
        <div className="page-actions">
          <div className="tabs seg">
            <Link
              href={`/memory${activeType ? `?type=${activeType}` : ""}`}
              className={view === "list" ? "is-active" : ""}
            >
              list
            </Link>
            <Link
              href={`/memory?view=brain${activeType ? `&type=${activeType}` : ""}`}
              className={view === "brain" ? "is-active" : ""}
            >
              brain
            </Link>
          </div>
          <Link href="/memory/new" className="btn btn-primary">
            + new memory
          </Link>
        </div>
      </header>

      {view === "list" ? (
        <>
          <div className="mem-filters">
            <div className="chips">
              <Link
                href="/memory"
                className={`px-chip ${!activeType ? "is-on" : ""}`}
                style={{ ["--tag-color" as string]: "var(--paper-ink)" }}
              >
                <span className="px-chip-dot" />
                all
                <span className="px-chip-count">{allItems.length}</span>
              </Link>
              {SUPERTAGS.map((t) => {
                const isOn = activeType === t;
                return (
                  <Link
                    key={t}
                    href={isOn ? "/memory" : `/memory?type=${t}`}
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
            <form action="/memory" method="get" style={{ display: "contents" }}>
              {activeType && <input type="hidden" name="type" value={activeType} />}
              <input
                type="text"
                name="q"
                placeholder="filter title or id…"
                defaultValue={sp.q ?? ""}
                className="app-search"
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

          <div className="mem-list">
            <div className="mem-list-head">
              <span>id</span>
              <span>title</span>
              <span className="fields-h">fields</span>
              <span className="date-h">updated · by</span>
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
                <Link href="/memory" style={{ color: "var(--paper-accent)" }}>
                  clear
                </Link>
              </div>
            ) : (
              items.map((m: unknown) => {
                const row = m as {
                  id: string;
                  type: string;
                  title: string;
                  slug: string | null;
                  status: string;
                  updated_at: string | null;
                  fields: Record<string, unknown> | null;
                };
                const fields = row.fields ?? {};
                const entries = Object.entries(fields).slice(0, 3);
                return (
                  <Link key={row.id} href={`/memory/${row.id}`} className="mem-row">
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
                            {typeof v === "string" || typeof v === "number"
                              ? String(v)
                              : "—"}
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
              showing {items.length} of {allItems.length}
            </span>
            <span>postgres · RLS active</span>
          </div>
        </>
      ) : (
        <div
          className="card"
          style={{
            padding: 0,
            minHeight: 480,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              padding: "12px 16px",
              borderBottom: "1px solid var(--paper-rule)",
              background: "var(--paper-bg-2)",
              fontFamily: "var(--font-geist-mono), monospace",
              fontSize: 11.5,
              color: "var(--paper-muted)",
            }}
          >
            <span>
              <strong style={{ color: "var(--paper-ink)", fontWeight: 500 }}>
                {allItems.length}
              </strong>{" "}
              nodes · all types
            </span>
            <span>brain view · 3D coming next</span>
          </div>
          <div
            style={{
              flex: 1,
              display: "grid",
              placeItems: "center",
              padding: 48,
              color: "var(--paper-muted)",
            }}
          >
            <div style={{ textAlign: "center", maxWidth: 420 }}>
              <div
                className="section-eyebrow"
                style={{ justifyContent: "center", marginBottom: 12 }}
              >
                brain view
              </div>
              <p style={{ fontSize: 14.5, lineHeight: 1.55, color: "var(--paper-ink-2)" }}>
                The 3D rotating brain (point cloud + anchored memory nodes by tag)
                ships in the next port. For now,{" "}
                <Link href="/graph" style={{ color: "var(--paper-accent)" }}>
                  use the 2D graph
                </Link>{" "}
                or browse the list view.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
