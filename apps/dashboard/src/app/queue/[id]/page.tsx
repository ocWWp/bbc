import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { findById, isApproved } from "@/lib/read-queue";
import { readObservationMeta, type ObservationMeta } from "@/lib/home/read-observation-meta";
import { requireActor, requireRole } from "@/lib/auth/require-user";
import ActionButtons from "@/components/ActionButtons";
import type { Proposal } from "@bbc/store";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string }> };

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

/**
 * Parse the proposal body into structured diff lines if it contains unified-
 * diff markers, otherwise treat it as prose. Falls back gracefully when the
 * body is empty.
 */
function parseBody(body: string): { diff: { t: "ctx" | "add" | "del"; s: string; l: string }[]; prose: string } {
  const lines = body.split("\n");
  const diff: { t: "ctx" | "add" | "del"; s: string; l: string }[] = [];
  const proseLines: string[] = [];
  let inDiff = false;

  for (const raw of lines) {
    const line = raw.replace(/\r$/, "");
    if (line.startsWith("```diff") || line.startsWith("```patch")) {
      inDiff = true;
      continue;
    }
    if (inDiff && line.startsWith("```")) {
      inDiff = false;
      continue;
    }
    if (inDiff) {
      if (line.startsWith("+") && !line.startsWith("+++")) {
        diff.push({ t: "add", s: "+", l: line.slice(1) });
      } else if (line.startsWith("-") && !line.startsWith("---")) {
        diff.push({ t: "del", s: "-", l: line.slice(1) });
      } else if (!line.startsWith("@@")) {
        diff.push({ t: "ctx", s: " ", l: line });
      }
      continue;
    }
    proseLines.push(line);
  }

  // Also pick up raw +/- lines in prose body as inline diff hints.
  if (diff.length === 0) {
    for (const line of proseLines.slice(0, 12)) {
      if (line.startsWith("+") && !line.startsWith("+++")) {
        diff.push({ t: "add", s: "+", l: line.slice(1).trim() || " " });
      } else if (line.startsWith("-") && !line.startsWith("---")) {
        diff.push({ t: "del", s: "-", l: line.slice(1).trim() || " " });
      }
    }
  }

  return { diff, prose: proseLines.join("\n").trim() };
}

export default async function ProposalDetail({ params }: PageProps) {
  const { id } = await params;

  // Operator+ only. Members get bounced to /brain. Matches /ops (the
  // canonical queue surface that links here) so a member who lands on a
  // proposal detail URL — e.g. via an Inbox notification — doesn't end up
  // reading queue contents the operator gate is meant to protect.
  const a = await requireActor();
  if (!a.ok) {
    redirect(`/auth/signin?callbackUrl=${encodeURIComponent("/queue/" + id)}`);
  }
  const r = requireRole(a.actor, "operator");
  if (!r.ok) redirect("/brain");

  const p = await findById(id);
  if (!p) notFound();

  const observationMeta = await readObservationMeta(p.proposal_id);
  const isAdmin = a.actor.role === "admin";

  const tag = observationMeta ? "observation" : inferTag(p);
  const reviewed = !!p.manager_review;
  const verdict = p.manager_review?.verdict;
  const canAccept = isApproved(p);
  const { diff, prose } = parseBody(p.body ?? "");

  const statusPill =
    p.status === "accepted"
      ? "ok"
      : p.status === "rejected"
      ? "err"
      : "warn";

  return (
    <div className="container-narrow page">
      <header className="page-head">
        <div className="page-head-left">
          <div className="page-crumb">
            <Link href="/ops">ops</Link>
            <span className="sep">/</span>
            <span className="current mono">{p.proposal_id}</span>
          </div>
          <h1 className="page-title">{p.diff_summary || p.proposal_id}</h1>
        </div>
        {p.status === "pending" && (
          <div className="page-actions">
            <ActionButtons id={p.proposal_id} canAccept={canAccept} />
          </div>
        )}
      </header>

      {p.status !== "pending" && (
        <div className={`banner ${statusPill === "ok" ? "ok" : "err"}`}>
          <span className="dot" />
          <span style={{ flex: 1 }}>
            This proposal is <strong>{p.status}</strong>.{" "}
            {p.status === "accepted" && p.target_file ? (
              <>
                It wrote to <span className="mono">{p.target_file}</span>; the
                pre-accept version is in the activity log.
              </>
            ) : p.status === "rejected" && p.reject_reason ? (
              <>
                Reason: <span className="mono">{p.reject_reason}</span>
              </>
            ) : null}
          </span>
        </div>
      )}

      {reviewed && (
        <div className={`banner ${verdict === "approved" ? "ok" : verdict === "rejected" ? "err" : "warn"}`}>
          <span className="dot" />
          <span style={{ flex: 1 }}>
            Manager <strong>{verdict}</strong>
            {p.manager_review?.reviewer && (
              <>
                {" "}by <span className="mono">{p.manager_review.reviewer}</span>
              </>
            )}
            {p.manager_review?.notes && <> — {p.manager_review.notes}</>}
          </span>
        </div>
      )}

      {observationMeta && <ObservationDetail meta={observationMeta} isAdmin={isAdmin} />}

      <div className="split-doc">
        <main style={{ display: "flex", flexDirection: "column", gap: 18, minWidth: 0 }}>
          <div className="frontmatter">
            <div className="fm-head">frontmatter</div>
            <div className="fm-row">
              <span className="k">tag</span>
              <span className="v">
                <span
                  className="tag"
                  style={{ ["--tag-color" as string]: `var(--t-${tag})` }}
                >
                  <span className="dot" />
                  {tag}
                </span>
              </span>
            </div>
            <div className="fm-row">
              <span className="k">target_file</span>
              <span className="v">
                {p.target_file ? <code>{p.target_file}</code> : <span className="mono" style={{ color: "var(--paper-muted)" }}>—</span>}
              </span>
            </div>
            <div className="fm-row">
              <span className="k">target_layer</span>
              <span className="v">{p.target_layer ?? "—"}</span>
            </div>
            <div className="fm-row">
              <span className="k">change_kind</span>
              <span className="v">
                <span className="pill">{p.change_kind ?? "—"}</span>
              </span>
            </div>
            <div className="fm-row">
              <span className="k">status</span>
              <span className="v">
                <span className={`pill ${statusPill}`}>
                  <span className="dot" /> {p.status}
                </span>
              </span>
            </div>
            <div className="fm-row">
              <span className="k">filed_by</span>
              <span className="v">{p.proposed_by ?? "—"}</span>
            </div>
            <div className="fm-row">
              <span className="k">filed_at</span>
              <span className="v">
                <span className="mono">{p.proposed_at ?? "—"}</span>
              </span>
            </div>
            {p.source && (
              <div className="fm-row">
                <span className="k">source</span>
                <span className="v">
                  <code>{p.source}</code>
                </span>
              </div>
            )}
          </div>

          {diff.length > 0 && (
            <div className="proposal-diff" style={{ borderRadius: 10 }}>
              {diff.map((d, i) => (
                <div key={i} className={`line ${d.t}`}>
                  <span className="sym">{d.s}</span>
                  <span>{d.l || " "}</span>
                </div>
              ))}
            </div>
          )}

          {prose && (
            <article className="prose">
              {prose.split("\n\n").map((para, i) => (
                <p key={i}>{para}</p>
              ))}
            </article>
          )}
        </main>

        <aside className="linkrail">
          {p.cross_leaf_impact && Object.keys(p.cross_leaf_impact).length > 0 && (
            <div className="linkrail-block">
              <div className="lab">cross-leaf impact</div>
              <div style={{ fontSize: 12.5, color: "var(--paper-ink-2)", display: "flex", flexDirection: "column", gap: 6 }}>
                {Object.entries(p.cross_leaf_impact).map(([k, v]) => (
                  <div key={k}>
                    <span className="mono" style={{ color: "var(--paper-muted)", marginRight: 6 }}>
                      {k}:
                    </span>
                    <span>{v}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {p.promotion_check && Object.keys(p.promotion_check).length > 0 && (
            <div className="linkrail-block">
              <div className="lab">promotion check</div>
              <div style={{ fontSize: 12.5, color: "var(--paper-ink-2)", display: "flex", flexDirection: "column", gap: 6 }}>
                {Object.entries(p.promotion_check).map(([k, v]) => (
                  <div key={k}>
                    <span className="mono" style={{ color: "var(--paper-muted)", marginRight: 6 }}>
                      {k}:
                    </span>
                    <span>{v}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="linkrail-block">
            <div className="lab">filed by</div>
            <div style={{ fontSize: 13, color: "var(--paper-ink-2)", lineHeight: 1.55 }}>
              <div className="mono" style={{ color: "var(--paper-muted)", marginBottom: 4 }}>
                proposer
              </div>
              <div style={{ marginBottom: 8 }}>{p.proposed_by ?? "unknown"}</div>
              {p.source && (
                <>
                  <div className="mono" style={{ color: "var(--paper-muted)", marginBottom: 4 }}>
                    via
                  </div>
                  <div className="mono" style={{ fontSize: 11.5 }}>
                    {p.source}
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="linkrail-block">
            <div className="lab">data</div>
            <div style={{ fontSize: 12, color: "var(--paper-muted)", lineHeight: 1.55 }}>
              <div>
                <span className="mono">queue/</span>
                {p.status === "pending" ? "" : `_${p.status}/`}
                <span className="mono">{p.filename}</span>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function ObservationDetail({
  meta,
  isAdmin,
}: {
  meta: ObservationMeta;
  isAdmin: boolean;
}) {
  const a = meta.anomalySummary;
  const w = meta.baselineWindow;
  return (
    <section
      className="rounded-xl border border-border bg-card/60 p-4"
      data-testid="observation-detail"
      style={{ marginBottom: 18 }}
    >
      <div
        className="text-xs uppercase tracking-wide"
        style={{ color: "var(--paper-muted)", marginBottom: 8 }}
      >
        How BBC found this
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
          gap: "10px 24px",
          fontSize: 13,
          lineHeight: 1.6,
        }}
      >
        <div>
          <div style={{ color: "var(--paper-muted)" }}>Signal</div>
          <div>
            <code>{meta.signalSource}</code>
            {a.metric ? <> · {a.metric}</> : null}
          </div>
        </div>
        <div>
          <div style={{ color: "var(--paper-muted)" }}>Anomaly</div>
          <div>
            {typeof a.delta === "number" ? (
              <>
                Δ {a.delta.toFixed(2)} {a.deltaUnits ?? ""}
                {typeof a.zScore === "number" ? ` · z=${a.zScore.toFixed(2)}` : null}
              </>
            ) : (
              "—"
            )}
          </div>
        </div>
        <div>
          <div style={{ color: "var(--paper-muted)" }}>Window</div>
          <div className="mono" style={{ fontSize: 12 }}>
            {w.currentStart ? w.currentStart.slice(0, 10) : "—"} →{" "}
            {w.currentEnd ? w.currentEnd.slice(0, 10) : "—"}
          </div>
        </div>
        <div>
          <div style={{ color: "var(--paper-muted)" }}>Baseline</div>
          <div className="mono" style={{ fontSize: 12 }}>
            {w.baselineStart ? w.baselineStart.slice(0, 10) : "—"} →{" "}
            {w.baselineEnd ? w.baselineEnd.slice(0, 10) : "—"}
          </div>
        </div>
      </div>

      {meta.citations.length > 0 && (
        <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 6 }}>
          {meta.citations.map((id) => (
            <Link
              key={id}
              href={`/memory/${id}`}
              className="mono"
              style={{
                fontSize: 11,
                padding: "2px 8px",
                borderRadius: 999,
                border: "1px solid var(--paper-rule)",
                color: "var(--paper-ink-2)",
              }}
            >
              memory · {id.slice(0, 6)}
            </Link>
          ))}
        </div>
      )}

      {isAdmin && (
        <div style={{ marginTop: 12, fontSize: 11, color: "var(--paper-muted)" }}>
          run trace:{" "}
          <span className="mono">{meta.observerRunId}</span>
        </div>
      )}
    </section>
  );
}
