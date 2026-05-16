"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  disableSignal,
  enableSignal,
  deleteSignal,
  type SignalSummary,
} from "./actions";

type Props = {
  initialSignals: SignalSummary[];
  canMutate: boolean;
};

export default function ObserversClient({ initialSignals, canMutate }: Props) {
  const router = useRouter();
  const [signals, setSignals] = useState(initialSignals);
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function toggle(s: SignalSummary) {
    if (!canMutate) return;
    setBusyId(s.id);
    setError(null);
    startTransition(async () => {
      const res = s.enabled ? await disableSignal(s.id) : await enableSignal(s.id);
      if (!res.ok) {
        setError(res.error);
      } else {
        setSignals((prev) =>
          prev.map((row) =>
            row.id === s.id ? { ...row, enabled: !row.enabled } : row,
          ),
        );
      }
      setBusyId(null);
    });
  }

  function remove(s: SignalSummary) {
    if (!canMutate) return;
    if (!confirm(`Delete watch "${s.metricName}"? Past runs stay in the audit log.`)) {
      return;
    }
    setBusyId(s.id);
    setError(null);
    startTransition(async () => {
      const res = await deleteSignal(s.id);
      if (!res.ok) {
        setError(res.error);
      } else {
        setSignals((prev) => prev.filter((row) => row.id !== s.id));
      }
      setBusyId(null);
    });
  }

  async function runNow(s: SignalSummary) {
    setBusyId(s.id);
    setError(null);
    try {
      const res = await fetch(`/api/observer/run-now/${s.id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      const body = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || body?.ok === false) {
        setError(body?.error ?? `Run failed (HTTP ${res.status})`);
      } else {
        router.refresh();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Run failed.");
    } finally {
      setBusyId(null);
    }
  }

  if (signals.length === 0) {
    return (
      <div style={{ padding: 24, color: "var(--text-2)" }}>
        No watches yet. Ask BBC to set one up in chat — say something like
        &ldquo;watch my churn rate&rdquo; and accept the proposal.
      </div>
    );
  }

  return (
    <div>
      {error && (
        <div
          className="alert"
          style={{ margin: "0 20px 12px", padding: 12, color: "#c33" }}
        >
          {error}
        </div>
      )}
      <table className="set-table">
        <thead>
          <tr>
            <th>Metric</th>
            <th>State</th>
            <th>Last run</th>
            <th>Source</th>
            <th aria-label="actions" />
          </tr>
        </thead>
        <tbody>
          {signals.map((s) => {
            const busy = busyId === s.id && pending;
            return (
              <tr key={s.id} aria-busy={busy}>
                <td>
                  <div style={{ fontWeight: 500 }}>{s.metricName}</div>
                  <div style={{ fontSize: 12, color: "var(--text-2)" }}>
                    {s.signalType}
                  </div>
                </td>
                <td>
                  <button
                    type="button"
                    className={`btn ${s.enabled ? "btn-primary" : "btn-ghost"}`}
                    disabled={!canMutate || busy}
                    onClick={() => toggle(s)}
                    title={canMutate ? "Toggle this watch" : "Operator role required"}
                  >
                    {s.enabled ? "Watching" : "Paused"}
                  </button>
                </td>
                <td>
                  {s.lastRunAt ? (
                    <div>
                      <div>{new Date(s.lastRunAt).toLocaleString()}</div>
                      <div style={{ fontSize: 12, color: "var(--text-2)" }}>
                        {s.lastRunStatus}
                      </div>
                    </div>
                  ) : (
                    <span style={{ color: "var(--text-2)" }}>never</span>
                  )}
                </td>
                <td>
                  <Link href={`/settings/observers/${s.id}/runs`} className="link">
                    View runs
                  </Link>
                </td>
                <td style={{ textAlign: "right" }}>
                  <button
                    type="button"
                    className="btn"
                    disabled={busy || !s.enabled}
                    onClick={() => runNow(s)}
                    title={s.enabled ? "Run a check right now" : "Enable to run"}
                  >
                    Run check now
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger"
                    disabled={!canMutate || busy}
                    onClick={() => remove(s)}
                    title={canMutate ? "Delete this watch" : "Operator role required"}
                    style={{ marginLeft: 8 }}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
