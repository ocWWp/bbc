import Link from "next/link";
import { listPending, listAccepted, listRejected, isApproved } from "@/lib/read-queue";
import ActionButtons from "@/components/ActionButtons";
import DataSource from "@/components/DataSource";

export const dynamic = "force-dynamic";

export default async function QueuePage() {
  const [pending, accepted, rejected] = await Promise.all([
    listPending(),
    listAccepted(10),
    listRejected(10),
  ]);

  return (
    <>
      <h1>Queue</h1>
      <DataSource path="queue/, queue/_accepted/, queue/_rejected/" layer="Shared" />

      <div className="banner warn">
        <strong>dev only:</strong> Accept and Reject buttons shell out to <code>bash bbc/scripts/&#123;accept,reject&#125;.sh</code> on this machine. Localhost single-user usage only.
      </div>

      <h2>Pending ({pending.length})</h2>
      {pending.length === 0 ? (
        <p className="empty">queue is empty.</p>
      ) : (
        pending.map((p) => {
          const reviewed = !!p.manager_review;
          const verdict = p.manager_review?.verdict;
          const canAccept = isApproved(p);
          return (
            <div key={p.proposal_id} className="card proposal">
              <div className="row">
                <span className="label">id</span>
                <Link href={`/queue/${p.proposal_id}`}>
                  <code>{p.proposal_id}</code>
                </Link>
              </div>
              <div className="row">
                <span className="label">target</span>
                <code>{p.target_file}</code>
                <span className="pill">{p.change_kind}</span>
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
              </div>
              <div className="row">
                <span className="label">summary</span>
                <span>{p.diff_summary}</span>
              </div>
              <div className="row">
                <span className="label">source</span>
                <span className="mono-sm">{p.source ?? "(none)"}</span>
              </div>
              {p.manager_review?.notes && (
                <div className="row">
                  <span className="label">review notes</span>
                  <span className="mono-sm">{p.manager_review.notes}</span>
                </div>
              )}
              <ActionButtons id={p.proposal_id} canAccept={canAccept} />
            </div>
          );
        })
      )}

      <h2>Recent accepts ({accepted.length})</h2>
      {accepted.length === 0 ? (
        <p className="empty">none yet.</p>
      ) : (
        <table>
          <thead><tr><th>id</th><th>target</th><th>summary</th></tr></thead>
          <tbody>
            {accepted.map((p) => (
              <tr key={p.proposal_id}>
                <td><Link href={`/queue/${p.proposal_id}`}><code>{p.proposal_id}</code></Link></td>
                <td><code>{p.target_file}</code></td>
                <td className="mono-sm">{p.diff_summary}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2>Recent rejects ({rejected.length})</h2>
      {rejected.length === 0 ? (
        <p className="empty">none yet.</p>
      ) : (
        <table>
          <thead><tr><th>id</th><th>target</th><th>summary</th></tr></thead>
          <tbody>
            {rejected.map((p) => (
              <tr key={p.proposal_id}>
                <td><Link href={`/queue/${p.proposal_id}`}><code>{p.proposal_id}</code></Link></td>
                <td><code>{p.target_file}</code></td>
                <td className="mono-sm">{p.diff_summary}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
