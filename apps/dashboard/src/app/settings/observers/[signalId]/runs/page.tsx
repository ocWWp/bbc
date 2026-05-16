import Link from "next/link";
import { redirect } from "next/navigation";

import { requireActor } from "@/lib/auth/require-user";
import { listSignalRuns } from "../../actions";

export const metadata = {
  title: "Observer runs · Settings · BBC",
};

export const dynamic = "force-dynamic";

const STATUS_COPY: Record<string, string> = {
  completed: "Anomaly proposed",
  no_anomaly: "No anomaly",
  skipped_cooldown: "Skipped (cooldown)",
  skipped_min_sample: "Skipped (too few samples)",
  quota_exhausted: "Quota exhausted",
  adapter_error: "Adapter error",
  llm_error: "LLM error",
};

export default async function ObserverRunsPage({
  params,
}: {
  params: Promise<{ signalId: string }>;
}) {
  const a = await requireActor();
  if (!a.ok) redirect("/auth/signin");
  const { signalId } = await params;

  const res = await listSignalRuns(signalId);
  const runs = res.ok ? res.runs : [];

  return (
    <div className="set-block">
      <div className="set-block-head">
        <div>
          <div className="h">Run history</div>
          <div className="sub">
            Every check this watch has performed, newest first. Successful runs
            link to the proposal in /queue.
          </div>
        </div>
        <div>
          <Link href="/settings/observers" className="link">
            ← All observers
          </Link>
        </div>
      </div>

      {!res.ok && (
        <div style={{ padding: 20, color: "#c33" }}>
          Could not load runs: {res.error}
        </div>
      )}

      {res.ok && runs.length === 0 && (
        <div style={{ padding: 24, color: "var(--text-2)" }}>
          No runs yet. Use <em>Run check now</em> from the observers list to
          fire one.
        </div>
      )}

      {runs.length > 0 && (
        <table className="set-table">
          <thead>
            <tr>
              <th>When</th>
              <th>Outcome</th>
              <th>Window</th>
              <th>Tokens</th>
              <th>Proposal</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((r) => {
              const copy = STATUS_COPY[r.status] ?? r.status;
              return (
                <tr key={r.id}>
                  <td>{new Date(r.ranAt).toLocaleString()}</td>
                  <td>
                    <div>{copy}</div>
                    {r.errorClass && (
                      <div style={{ fontSize: 12, color: "var(--text-2)" }}>
                        {r.errorClass}
                      </div>
                    )}
                  </td>
                  <td style={{ fontSize: 12, color: "var(--text-2)" }}>
                    {new Date(r.windowStart).toLocaleDateString()} →{" "}
                    {new Date(r.windowEnd).toLocaleDateString()}
                  </td>
                  <td style={{ fontVariantNumeric: "tabular-nums" }}>
                    {r.llmTokensUsed ?? "—"}
                  </td>
                  <td>
                    {r.proposalsFiled.length > 0 ? (
                      <Link
                        href={`/queue/${encodeURIComponent(r.proposalsFiled[0])}`}
                        className="link"
                      >
                        View proposal
                      </Link>
                    ) : (
                      <span style={{ color: "var(--text-2)" }}>—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
