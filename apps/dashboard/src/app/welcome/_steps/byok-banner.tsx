"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { setProviderKey } from "@/app/settings/keys/actions";

type Props = {
  isHostedDemo: boolean;
};

export function ByokBanner({ isHostedDemo }: Props) {
  const [open, setOpen] = useState(false);
  const [secret, setSecret] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  const handleSave = () => {
    setError(null);
    startTransition(async () => {
      const res = await setProviderKey({
        providerId: "anthropic",
        kind: "api_key",
        plaintext: secret,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSaved(true);
      setSecret("");
    });
  };

  if (saved) {
    return (
      <div className="mb-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 text-sm">
        <span className="font-medium">Key saved.</span> Your runs are now billed to your
        Anthropic account.
      </div>
    );
  }

  return (
    <div className="mb-4 rounded-2xl border border-studio-accent/30 bg-studio-accent/5 px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="text-[11px] font-semibold tracking-[0.16em] uppercase text-studio-accent">
            {isHostedDemo ? "Hosted demo · daily cap applies" : "Bring your own AI key"}
          </div>
          <div className="text-sm mt-1 text-foreground/90">
            {isHostedDemo ? (
              <>
                Free runs share a small daily Anthropic budget. Paste your own key for
                unlimited runs — it&apos;s encrypted per-tenant and never leaves the server.
              </>
            ) : (
              <>
                No Anthropic key is configured for this tenant. Paste one to enable Studio
                runs, or rely on your server&apos;s <code className="text-xs">ANTHROPIC_API_KEY</code>{" "}
                env var.
              </>
            )}
          </div>
        </div>
        <Button
          variant={open ? "ghost" : "default"}
          size="sm"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? "Cancel" : "Add key"}
        </Button>
      </div>
      {open ? (
        <div className="mt-3 flex gap-2">
          <input
            type="password"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            placeholder="sk-ant-…"
            autoComplete="off"
            spellCheck={false}
            disabled={isPending}
            className="flex-1 rounded-md border bg-background px-3 py-2 text-sm font-mono"
            maxLength={2000}
          />
          <Button
            variant="default"
            size="default"
            onClick={handleSave}
            disabled={isPending || secret.length < 8}
          >
            {isPending ? "Saving…" : "Save"}
          </Button>
        </div>
      ) : null}
      {error ? (
        <div role="alert" className="mt-2 text-xs text-destructive">
          {error}
        </div>
      ) : null}
      <div className="mt-2 text-xs text-muted-foreground">
        Manage keys later at{" "}
        <Link href="/settings/keys" className="underline">
          /settings/keys
        </Link>
        .
      </div>
    </div>
  );
}
