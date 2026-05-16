import Link from "next/link";
import { redirect } from "next/navigation";
import { requireActor, requireRole } from "@/lib/auth/require-user";
import { listPending, listAccepted, listRejected, isApproved } from "@/lib/read-queue";
import ActionButtons from "@/components/ActionButtons";
import DataSource from "@/components/DataSource";
import { WorkspaceCrumb } from "@/components/WorkspaceCrumb";
import type { Proposal } from "@bbc/store";

export const dynamic = "force-dynamic";

/**
 * Infer a supertag for the proposal from its target_file path.
 * Falls back to "note" if the path doesn't match a known memory bucket.
 */
function inferTag(p: Proposal): string {
  const t = p.target_file ?? "";
  if (t.includes("/voice/")) return "voice";
  if (t.includes("/decisions/")) return "decision";
  if (t.includes("/vendors/")) return "vendor";
  if (t.includes("/team/")) return "team";
  if (t.includes("/product/")) return "product";
  if (t.includes("/glossary/")) return "glossary";
  if (t.includes("/skills/")) return "skill";
  if (t.includes("/design/")) return "product";
  return "note";
}

function relTime(iso?: string): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return iso;
  const diff = Math.max(0, Date.now() - t);
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(t).toISOString().slice(0, 10);
}

/**
 * Heuristic: cut the body into a small head of context/add/del lines for the
 * inline diff strip on the card. Falls back to diff_summary if the body
 * doesn't contain unified-diff hints.
 */
function summaryLines(p: Proposal): { t: "ctx" | "add" | "del"; s: string; l: string }[] {
  const out: { t: "ctx" | "add" | "del"; s: string; l: string }[] = [];
  const body = p.body ?? "";
  for (const raw of body.split("\n")) {
    const line = raw.trimEnd();
    if (line.startsWith("+++") || line.startsWith("---") || line.startsWith("@@")) continue;
    if (line.startsWith("+")) out.push({ t: "add", s: "+", l: line.slice(1).trim() || " " });
    else if (line.startsWith("-")) out.push({ t: "del", s: "-", l: line.slice(1).trim() || " " });
    if (out.length >= 4) break;
  }
  if (out.length === 0 && p.diff_summary) {
    out.push({ t: "ctx", s: " ", l: p.diff_summary });
  }
  return out;
}

type Counts = {
  all: number;
  main: number;
  manager: number;
  awaitingReview: number;
  ready: number;
  edits: number;
  news: number;
};

function countProposals(pending: Proposal[]): Counts {
  return {
    all: pending.length,
    main: pending.filter((p) => p.target_layer === "main").length,
    manager: pending.filter((p) => p.target_layer === "manager").length,
    awaitingReview: pending.filter((p) => !p.manager_review).length,
    ready: pending.filter((p) => p.manager_review?.verdict === "approved").length,
    edits: pending.filter((p) => p.change_kind === "edit").length,
    news: pending.filter((p) => p.change_kind === "add" || p.change_kind === "new").length,
  };
}

function TagBadge({ name }: { name: string }) {
  return (
    <span className="tag" style={{ ["--tag-color" as string]: `var(--t-${name})` }}>
      <span className="dot" />
      {name}
    </span>
  );
}

export default async function QueuePage() {
  const a = await requireActor();
  if (!a.ok) redirect(`/auth/signin?callbackUrl=${encodeURIComponent("/queue")}`);
  // Per ADR-0012: queue accept/reject is operator+. Members file proposals via Flag-this
  // but cannot resolve them.
  const r = requireRole(a.actor, "operator");
  if (!r.ok) redirect("/brain");

  const [pending, accepted, rejected] = await Promise.all([
    listPending(),
    listAccepted(8),
    listRejected(8),
  ]);

  const counts = countProposals(pending);
  const isEmpty = pending.length === 0;
  const isFileMode = (process.env.BBC_MODE ?? "file").toLowerCase() !== "db";

  return (
    <div className="container page">
      <header className="page-head">
        <div className="page-head-left">
          <div className="page-crumb">
            <WorkspaceCrumb tenantSlug={a.actor.tenant_slug} />
            <span className="sep">/</span>
            <span className="current">queue</span>
          </div>
          <h1 className="page-title">
            {isEmpty ? (
              <>queue <span className="serif">to review</span></>
            ) : (
              <>
                {pending.length} proposal{pending.length === 1 ? "" : "s"}{" "}
                <span className="serif">to review</span>
              </>
            )}
          </h1>
          <p className="page-blurb">
            Studios file proposals back here when their drafts are accepted. Every
            change to typed memory passes through this page — no silent writes.
          </p>
        </div>
        {!isEmpty && (
          <div className="page-actions">
            <span className="pill muted">
              {counts.awaitingReview} awaiting review · {counts.ready} ready
            </span>
          </div>
        )}
      </header>

      {isFileMode && (
        <div className="banner warn">
          <span className="dot" />
          <span style={{ flex: 1 }}>
            <strong>file-mode:</strong> Accept and Reject buttons shell out to{" "}
            <code>bash bbc/scripts/&#123;accept,reject&#125;.sh</code> on this machine.
            Localhost single-user usage only.
          </span>
        </div>
      )}

      {isEmpty ? (
        <div className="empty lg">
          <div className="e-eyebrow">00 proposals · 00 manager-layer · 00 main-layer</div>
          <h2 className="e-title">
            No proposals <span className="serif">yet</span>.
          </h2>
          <p className="e-body">
            When a studio&apos;s draft is accepted, it files structured proposals back to
            this queue for review. Run one to see how the loop closes.
          </p>
          <div className="e-actions">
            <Link href="/studio" className="btn btn-primary btn-lg">
              open /studio
            </Link>
            <Link href="/log" className="btn btn-ghost btn-lg">
              view activity log
            </Link>
          </div>
        </div>
      ) : (
        <div className="split-three">
          <aside>
            <div className="rail">
              <div className="rail-eyebrow">target layer</div>
              <a className="rail-item is-active">
                all <span className="count">{counts.all}</span>
              </a>
              <a className="rail-item">
                main <span className="count">{counts.main}</span>
              </a>
              <a className="rail-item">
                manager <span className="count">{counts.manager}</span>
              </a>
              <div className="rail-eyebrow">change</div>
              <a className="rail-item">
                edits <span className="count">{counts.edits}</span>
              </a>
              <a className="rail-item">
                new files <span className="count">{counts.news}</span>
              </a>
              <div className="rail-eyebrow">status</div>
              <a className="rail-item">
                awaiting review <span className="count">{counts.awaitingReview}</span>
              </a>
              <a className="rail-item">
                ready to accept <span className="count">{counts.ready}</span>
              </a>
            </div>
          </aside>

          <main style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {pending.map((p) => {
              const tag = inferTag(p);
              const lines = summaryLines(p);
              const reviewed = !!p.manager_review;
              const verdict = p.manager_review?.verdict;
              const canAccept = isApproved(p);
              return (
                <article className="card proposal-v2" key={p.proposal_id}>
                  <header className="proposal-head">
                    <TagBadge name={tag} />
                    <span className="pill muted">{p.target_layer ?? "—"}-layer</span>
                    <span className="pill">
                      {p.change_kind === "edit" ? "Δ edit" : "+ new"}
                    </span>
                    <span
                      className={`pill ${
                        reviewed
                          ? verdict === "approved"
                            ? "ok"
                            : verdict === "rejected"
                            ? "err"
                            : "warn"
                          : "muted"
                      }`}
                    >
                      {reviewed ? `manager: ${verdict}` : "awaiting review"}
                    </span>
                    <span className="id">{p.proposal_id}</span>
                    {p.target_file && (
                      <>
                        <span className="sep">·</span>
                        <span className="mono" style={{ color: "var(--paper-muted)" }}>
                          {p.target_file}
                        </span>
                      </>
                    )}
                  </header>

                  <h3 className="proposal-title">
                    <Link href={`/queue/${p.proposal_id}`}>
                      {p.diff_summary || p.proposal_id}
                    </Link>
                  </h3>

                  {lines.length > 0 && (
                    <div className="proposal-diff">
                      {lines.map((d, i) => (
                        <div key={i} className={`line ${d.t}`}>
                          <span className="sym">{d.s}</span>
                          <span>{d.l}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  <footer className="proposal-foot">
                    <div className="meta">
                      <span>
                        filed by{" "}
                        <strong>{p.proposed_by ?? "unknown"}</strong>
                      </span>
                      {p.source && (
                        <>
                          <span style={{ color: "var(--paper-rule-2)" }}>·</span>
                          <span>{p.source}</span>
                        </>
                      )}
                      <span style={{ color: "var(--paper-rule-2)" }}>·</span>
                      <span>{relTime(p.proposed_at)}</span>
                    </div>
                    <Link
                      href={`/queue/${p.proposal_id}`}
                      className="mono"
                      style={{ color: "var(--paper-accent)" }}
                    >
                      review →
                    </Link>
                  </footer>

                  <div className="proposal-actions">
                    <ActionButtons id={p.proposal_id} canAccept={canAccept} />
                  </div>
                </article>
              );
            })}
          </main>

          <aside>
            <div className="card card-pad" style={{ position: "sticky", top: 80 }}>
              <div className="section-eyebrow" style={{ marginBottom: 14 }}>
                this queue
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr auto",
                  gap: "8px 14px",
                  fontSize: 13,
                  color: "var(--paper-ink-2)",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                <span>open</span>
                <strong>{counts.all}</strong>
                <span>main-layer</span>
                <strong>{counts.main}</strong>
                <span>manager-layer</span>
                <strong>{counts.manager}</strong>
                <span>awaiting review</span>
                <strong>{counts.awaitingReview}</strong>
                <span>ready to accept</span>
                <strong>{counts.ready}</strong>
              </div>
              <hr
                style={{
                  border: "none",
                  borderTop: "1px solid var(--paper-rule)",
                  margin: "16px 0",
                }}
              />
              <div className="section-eyebrow" style={{ marginBottom: 14 }}>
                recent activity
              </div>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  fontSize: 13,
                  color: "var(--paper-ink-2)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>accepted</span>
                  <strong>{accepted.length}</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>rejected</span>
                  <strong>{rejected.length}</strong>
                </div>
              </div>
              <Link
                href="/log"
                className="mono"
                style={{
                  color: "var(--paper-accent)",
                  fontSize: 12,
                  marginTop: 14,
                  display: "inline-block",
                }}
              >
                full log →
              </Link>
              <DataSource
                path="queue/, queue/_accepted/, queue/_rejected/"
                layer="Shared"
              />
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
