"use client";

import { useCallback, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  revokeProviderKey,
  setProviderKey,
  type ProviderKeySummary,
} from "./actions";

type Props = {
  initialKeys: ProviderKeySummary[];
};

const PROVIDER_OPTIONS: Array<{ id: string; label: string; hint: string }> = [
  { id: "anthropic", label: "Anthropic", hint: "sk-ant-…" },
  { id: "openai", label: "OpenAI", hint: "sk-… or sk-proj-…" },
  { id: "resend", label: "Resend (email)", hint: "re_…" },
];

export default function KeysClient({ initialKeys }: Props) {
  const [keys, setKeys] = useState<ProviderKeySummary[]>(initialKeys);
  const [providerId, setProviderId] = useState("anthropic");
  const [secret, setSecret] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleAdd = useCallback(() => {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const res = await setProviderKey({
        providerId,
        kind: "api_key",
        plaintext: secret,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      // Optimistic refresh: mark every prior active row for this provider as
      // revoked, prepend the new active row.
      setKeys((prev) => [
        {
          id: res.externalAccountId,
          providerId,
          kind: "api_key",
          displayHint: res.displayHint,
          status: "active",
          createdAt: new Date().toISOString(),
          revokedAt: null,
        },
        ...prev.map((k) =>
          k.providerId === providerId && k.kind === "api_key" && k.status === "active"
            ? { ...k, status: "revoked" as const, revokedAt: new Date().toISOString() }
            : k,
        ),
      ]);
      setSecret("");
      setSuccess(`${providerLabel(providerId)} key saved.`);
    });
  }, [providerId, secret]);

  const handleRevoke = useCallback((id: string) => {
    startTransition(async () => {
      const res = await revokeProviderKey(id);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setKeys((prev) =>
        prev.map((k) =>
          k.id === id
            ? { ...k, status: "revoked", revokedAt: new Date().toISOString() }
            : k,
        ),
      );
    });
  }, []);

  const activeKeys = keys.filter((k) => k.status === "active");
  const revokedKeys = keys.filter((k) => k.status === "revoked");

  return (
    <div className="space-y-8">
      {/* Add form */}
      <section className="rounded-2xl border bg-card p-5 sm:p-6">
        <h2 className="text-base font-semibold mb-3">Add a key</h2>
        <div className="grid grid-cols-1 sm:grid-cols-[180px_1fr_auto] gap-3 items-end">
          <label className="block">
            <div className="text-xs text-muted-foreground mb-1">Provider</div>
            <select
              value={providerId}
              onChange={(e) => setProviderId(e.target.value)}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              disabled={isPending}
            >
              {PROVIDER_OPTIONS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <div className="text-xs text-muted-foreground mb-1">
              Key{" "}
              <span className="opacity-70">
                ({PROVIDER_OPTIONS.find((p) => p.id === providerId)?.hint})
              </span>
            </div>
            <input
              type="password"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              placeholder="Paste your API key"
              autoComplete="off"
              spellCheck={false}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm font-mono"
              disabled={isPending}
              maxLength={2000}
            />
          </label>
          <Button
            variant="default"
            size="default"
            onClick={handleAdd}
            disabled={isPending || secret.length < 8}
          >
            {isPending ? "Saving…" : "Save key"}
          </Button>
        </div>
        {error ? (
          <div role="alert" className="mt-3 text-sm text-destructive">
            {error}
          </div>
        ) : null}
        {success ? (
          <div className="mt-3 text-sm text-emerald-600 dark:text-emerald-400">{success}</div>
        ) : null}
      </section>

      {/* Active keys */}
      <section>
        <h2 className="text-xs font-semibold tracking-[0.16em] uppercase text-muted-foreground mb-3">
          Active
        </h2>
        {activeKeys.length === 0 ? (
          <div className="rounded-2xl border bg-card p-5 text-sm text-muted-foreground">
            No keys yet. The hosted demo will use the shared key with daily caps.
          </div>
        ) : (
          <ul className="space-y-2">
            {activeKeys.map((k) => (
              <li
                key={k.id}
                className="flex items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-[11px] uppercase tracking-widest text-muted-foreground">
                    {providerLabel(k.providerId)}
                  </span>
                  <span className="font-mono text-sm truncate">{k.displayHint}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground">
                    added {relativeAge(k.createdAt)}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRevoke(k.id)}
                    disabled={isPending}
                  >
                    Revoke
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Revoked history */}
      {revokedKeys.length > 0 ? (
        <section>
          <h2 className="text-xs font-semibold tracking-[0.16em] uppercase text-muted-foreground mb-3">
            Revoked
          </h2>
          <ul className="space-y-2">
            {revokedKeys.slice(0, 10).map((k) => (
              <li
                key={k.id}
                className="flex items-center justify-between gap-3 rounded-xl border bg-muted/30 px-4 py-2 text-sm text-muted-foreground"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-[10px] uppercase tracking-widest">
                    {providerLabel(k.providerId)}
                  </span>
                  <span className="font-mono truncate">{k.displayHint}</span>
                </div>
                <span className="text-xs">
                  revoked {k.revokedAt ? relativeAge(k.revokedAt) : ""}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function providerLabel(id: string): string {
  return PROVIDER_OPTIONS.find((p) => p.id === id)?.label ?? id;
}

function relativeAge(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const diff = Date.now() - t;
  const min = Math.round(diff / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.round(hr / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}
