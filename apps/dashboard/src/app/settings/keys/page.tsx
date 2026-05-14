import { redirect } from "next/navigation";
import { requireActor, requireRole } from "@/lib/auth/require-user";
import KeysClient from "./KeysClient";
import { listProviderKeys } from "./actions";

export const metadata = {
  title: "API keys · Settings · BBC",
};

export const dynamic = "force-dynamic";

export default async function ApiKeysSettingsPage() {
  const a = await requireActor();
  if (!a.ok) {
    redirect(`/auth/signin?callbackUrl=${encodeURIComponent("/settings/keys")}`);
  }
  // Per ADR-0012: provider keys are tenant-shared infrastructure; operator+.
  const r = requireRole(a.actor, "operator");
  if (!r.ok) redirect("/brain");

  const res = await listProviderKeys();
  const keys = res.ok ? res.keys : [];

  return (
    <>
      <div className="set-block">
        <div className="set-block-head">
          <div>
            <div className="h">Bring your own AI</div>
            <div className="sub">
              Paste your own provider keys. BBC encrypts them per-tenant before
              storing and never sends them back to the browser. The hosted demo
              uses the maintainer&apos;s shared key with a small daily cap;
              bringing your own key removes that cap.
            </div>
          </div>
        </div>
        <div style={{ padding: 20 }}>
          <KeysClient initialKeys={keys} />
        </div>
      </div>
    </>
  );
}
