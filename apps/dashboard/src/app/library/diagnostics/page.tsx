// v1.5 D-W6-4: admin-only /library/diagnostics.
//
// Per-connector sync state + DLQ counts. Non-admin (and unauth) → notFound(),
// which renders Next's 404 page so the route doesn't reveal its existence to
// non-admins. We intentionally do NOT 403 — the launch plan calls for 404.

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireActor, requireRole } from "@/lib/auth/require-user";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { readDiagnostics, computeHealthBuckets } from "@/lib/connectors/read-diagnostics";
import { installPathFor } from "@/lib/connectors/install-paths";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Diagnostics · Library · BBC", robots: { index: false, follow: false } };

export default async function DiagnosticsPage() {
  const actor = await requireActor();
  if (!actor.ok) notFound();
  const gate = requireRole(actor.actor, "admin");
  if (!gate.ok) notFound();

  const supabase = await getSupabaseServerClient();
  const diag = await readDiagnostics(supabase);
  const health = computeHealthBuckets(diag.connectors);
  const hasAttention = health.needs_attention > 0;

  return (
    <main className="lib-diag">
      <header className="lib-diag-head">
        <h1>Library / diagnostics</h1>
        <p className="muted">
          Admin-only. Per-connector sync state and webhook dead-letter counts for tenant{" "}
          <code>{actor.actor.tenant_slug}</code>.
        </p>
      </header>

      <section
        className={`lib-diag-section lib-diag-health${hasAttention ? " has-attention" : ""}`}
        aria-label="Connector health summary"
      >
        <h2>Connector health</h2>
        <div className="lib-diag-buckets">
          <div className="lib-diag-bucket">
            <div className="lab">healthy</div>
            <div className="num">{health.healthy}</div>
          </div>
          <div className={`lib-diag-bucket${hasAttention ? " warn" : ""}`}>
            <div className="lab">need attention</div>
            <div className="num">{health.needs_attention}</div>
          </div>
          <div className="lib-diag-bucket">
            <div className="lab">never synced</div>
            <div className="num">{health.never_synced}</div>
          </div>
        </div>
      </section>

      <section className="lib-diag-section">
        <h2>Dead-letter totals</h2>
        {diag.total_dlq === 0 ? (
          <p className="muted">
            No dead-lettered webhook payloads. Everything that came in passed signature, timestamp, and mapping checks.
          </p>
        ) : (
          <table className="lib-diag-table">
            <thead>
              <tr>
                <th>reason</th>
                <th>count</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(diag.dlq_by_reason)
                .filter(([, n]) => n > 0)
                .map(([reason, n]) => (
                  <tr key={reason}>
                    <td>
                      <code>{reason}</code>
                    </td>
                    <td>{n}</td>
                  </tr>
                ))}
              <tr className="total">
                <td>
                  <strong>total</strong>
                </td>
                <td>
                  <strong>{diag.total_dlq}</strong>
                </td>
              </tr>
            </tbody>
          </table>
        )}
      </section>

      <section className="lib-diag-section">
        <h2>Installed connectors</h2>
        {diag.connectors.length === 0 ? (
          <p className="muted">No connectors installed yet.</p>
        ) : (
          <table className="lib-diag-table">
            <thead>
              <tr>
                <th>connector</th>
                <th>status</th>
                <th>last sync</th>
                <th>dlq</th>
                <th>last error</th>
                <th>actions</th>
              </tr>
            </thead>
            <tbody>
              {diag.connectors.map((c) => {
                const installHref =
                  c.last_sync_status === "auth_expired" ? installPathFor(c.connector_id) : undefined;
                return (
                  <tr key={c.row_id}>
                    <td>
                      <code>{c.connector_id}</code>
                    </td>
                    <td>
                      {c.last_sync_status ? (
                        <span className={`pill ${pillClassFor(c.last_sync_status)}`}>{c.last_sync_status}</span>
                      ) : (
                        <span className="muted">never synced</span>
                      )}
                    </td>
                    <td>{c.last_sync_at ?? "—"}</td>
                    <td>{c.dlq_count}</td>
                    <td className="err">{c.last_sync_error ?? "—"}</td>
                    <td>
                      {installHref ? (
                        <a className="btn-reconnect" href={installHref}>
                          reconnect
                        </a>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}

function pillClassFor(status: string): string {
  switch (status) {
    case "ok":
      return "ok";
    case "partial":
      return "warn";
    case "rate_limited":
    case "auth_expired":
      return "warn";
    case "error":
      return "err";
    default:
      return "muted";
  }
}
