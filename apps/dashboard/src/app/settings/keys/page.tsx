import { redirect } from "next/navigation";
import { requireActor } from "@/lib/auth/require-user";
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

  const res = await listProviderKeys();
  const keys = res.ok ? res.keys : [];

  return (
    <main className="mx-auto max-w-3xl px-4 sm:px-6 py-8 sm:py-12">
      <header className="mb-8">
        <div className="text-[11px] font-semibold tracking-[0.18em] uppercase text-muted-foreground">
          Settings · API keys
        </div>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">Bring your own AI</h1>
        <p className="mt-2 text-muted-foreground max-w-xl">
          Paste your own provider keys. BBC encrypts them per-tenant before
          storing and never sends them back to the browser. The hosted demo
          uses the maintainer&apos;s shared key with a small daily cap; bringing
          your own key removes that cap and routes spend through your account.
        </p>
      </header>

      <KeysClient initialKeys={keys} />
    </main>
  );
}
