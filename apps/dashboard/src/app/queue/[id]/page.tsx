import { notFound } from "next/navigation";
import { findById, isApproved } from "@/lib/read-queue";
import ActionButtons from "@/components/ActionButtons";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string }> };

export default async function ProposalDetail({ params }: PageProps) {
  const { id } = await params;
  const p = await findById(id);
  if (!p) notFound();

  const reviewed = !!p.manager_review;
  const verdict = p.manager_review?.verdict;

  return (
    <>
      <h1>{p.proposal_id}</h1>

      <div className="card">
        <div className="row">
          <span className="label">status</span>
          <span className={`pill ${p.status === "accepted" ? "ok" : p.status === "rejected" ? "err" : "warn"}`}>
            {p.status}
          </span>
        </div>
        <div className="row"><span className="label">proposed by</span><span>{p.proposed_by ?? "—"}</span></div>
        <div className="row"><span className="label">proposed at</span><span className="mono-sm">{p.proposed_at ?? "—"}</span></div>
        <div className="row"><span className="label">target file</span><code>{p.target_file ?? "—"}</code></div>
        <div className="row"><span className="label">target layer</span><span>{p.target_layer ?? "—"}</span></div>
        <div className="row"><span className="label">change kind</span><span className="pill">{p.change_kind ?? "—"}</span></div>
        <div className="row"><span className="label">summary</span><span>{p.diff_summary ?? "—"}</span></div>
        <div className="row"><span className="label">source</span><span className="mono-sm">{p.source ?? "(none)"}</span></div>
      </div>

      {reviewed && (
        <>
          <h2>Manager review</h2>
          <div className="card">
            <div className="row">
              <span className="label">verdict</span>
              <span className={`pill ${verdict === "approved" ? "ok" : verdict === "rejected" ? "err" : "warn"}`}>
                {verdict}
              </span>
            </div>
            {p.manager_review?.reviewer && (
              <div className="row"><span className="label">reviewer</span><span>{p.manager_review.reviewer}</span></div>
            )}
            {p.manager_review?.reviewed_at && (
              <div className="row"><span className="label">reviewed at</span><span className="mono-sm">{p.manager_review.reviewed_at}</span></div>
            )}
            {p.manager_review?.notes && (
              <div className="row"><span className="label">notes</span><span>{p.manager_review.notes}</span></div>
            )}
          </div>
        </>
      )}

      {p.cross_leaf_impact && (
        <>
          <h2>Cross-leaf impact</h2>
          <div className="card">
            {Object.entries(p.cross_leaf_impact).map(([k, v]) => (
              <div key={k} className="row"><span className="label">{k}</span><span>{v}</span></div>
            ))}
          </div>
        </>
      )}

      {p.promotion_check && (
        <>
          <h2>Promotion check</h2>
          <div className="card">
            {Object.entries(p.promotion_check).map(([k, v]) => (
              <div key={k} className="row"><span className="label">{k}</span><span>{v}</span></div>
            ))}
          </div>
        </>
      )}

      <h2>Body</h2>
      <pre>{p.body.trim()}</pre>

      {p.status === "pending" && (
        <>
          <h2>Actions</h2>
          <div className="card">
            <ActionButtons id={p.proposal_id} canAccept={isApproved(p)} />
          </div>
        </>
      )}
    </>
  );
}
