import { redirect } from "next/navigation";

import { requireActor, requireRole } from "@/lib/auth/require-user";

import ObserversClient from "./ObserversClient";
import { listSignals } from "./actions";

export const metadata = {
  title: "Observers · Settings · BBC",
};

export const dynamic = "force-dynamic";

export default async function ObserversSettingsPage() {
  const a = await requireActor();
  if (!a.ok) {
    redirect(
      `/auth/signin?callbackUrl=${encodeURIComponent("/settings/observers")}`,
    );
  }

  const res = await listSignals();
  const signals = res.ok ? res.signals : [];
  const canMutate = requireRole(a.actor, "operator").ok;

  return (
    <div className="set-block">
      <div className="set-block-head">
        <div>
          <div className="h">Observers</div>
          <div className="sub">
            Each watch is a metric BBC checks for anomalies. Enabled watches
            run on demand here (or whenever you click <em>Run check now</em>);
            findings land in /queue as observation proposals you accept or
            reject. Past runs stay in the audit log.
          </div>
        </div>
      </div>
      <ObserversClient initialSignals={signals} canMutate={canMutate} />
    </div>
  );
}
