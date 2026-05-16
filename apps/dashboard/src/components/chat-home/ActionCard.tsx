"use client";

import { useState } from "react";
import Link from "next/link";

import { enableSignal } from "@/app/settings/observers/actions";

// Action-card kinds the agent can emit. Keep this list narrow on purpose
// — every kind needs an explicit UI; unknown kinds render as a labeled
// JSON blob so we don't accidentally bury a tool output.
export type ActionCardKind =
  | "route_match"
  | "draft_started"
  | "watch_proposed"
  | "memory_lookup"
  | string;

export type ActionCardProps = {
  kind: ActionCardKind;
  payload: unknown;
};

export function ActionCard({ kind, payload }: ActionCardProps) {
  return (
    <div
      className="my-2 rounded-lg border border-border bg-card/60 p-3 text-sm shadow-sm"
      data-testid={`action-card-${kind}`}
    >
      {renderBody(kind, payload)}
    </div>
  );
}

function renderBody(kind: ActionCardKind, payload: unknown) {
  switch (kind) {
    case "route_match":
      return <RouteMatchBody payload={payload} />;
    case "draft_started":
      return <DraftStartedBody payload={payload} />;
    case "watch_proposed":
      return <WatchProposedBody payload={payload} />;
    case "memory_lookup":
      return <MemoryLookupBody payload={payload} />;
    default:
      return <UnknownBody kind={kind} payload={payload} />;
  }
}

// ---- typed sub-bodies ----------------------------------------------------

function RouteMatchBody({ payload }: { payload: unknown }) {
  const p = asObj(payload);
  const route = typeof p.route === "string" ? p.route : "/";
  const label = typeof p.label === "string" ? p.label : route;
  return (
    <div className="flex items-center justify-between gap-3">
      <div>
        <div className="text-xs uppercase tracking-wide text-muted-foreground">Open</div>
        <div className="font-medium">{label}</div>
        <div className="font-mono text-xs text-muted-foreground">{route}</div>
      </div>
      <Link
        href={route}
        className="rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium hover:bg-muted"
      >
        Go
      </Link>
    </div>
  );
}

function DraftStartedBody({ payload }: { payload: unknown }) {
  const p = asObj(payload);
  const target = typeof p.target === "string" ? p.target : "draft";
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">Drafting</div>
      <div className="font-medium">{target}</div>
    </div>
  );
}

type WatchStep = "idle" | "setting-up" | "ready" | "enabling" | "enabled" | "error";

function WatchProposedBody({ payload }: { payload: unknown }) {
  const p = asObj(payload);
  const metric = typeof p.metric === "string" ? p.metric : "";
  const metricLabel = typeof p.metricLabel === "string" ? p.metricLabel : metric;
  const source = typeof p.source === "string" ? p.source : "posthog";
  const projectId = typeof p.projectId === "string" ? p.projectId : undefined;
  const region = p.region === "us" || p.region === "eu" ? p.region : undefined;

  const [step, setStep] = useState<WatchStep>("idle");
  const [signalId, setSignalId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function onSetup() {
    if (!metric) {
      setStep("error");
      setErrorMsg("Card is missing the metric — ask BBC to propose again.");
      return;
    }
    setStep("setting-up");
    setErrorMsg(null);
    try {
      const res = await fetch("/api/observer/signals/setup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ metric, projectId, region }),
      });
      const body = (await res.json().catch(() => null)) as
        | { ok: true; signalId: string }
        | { ok: false; error: string }
        | null;
      if (!res.ok || !body || body.ok === false) {
        setStep("error");
        setErrorMsg(body && body.ok === false ? body.error : `Setup failed (HTTP ${res.status})`);
        return;
      }
      setSignalId(body.signalId);
      setStep("ready");
    } catch (e) {
      setStep("error");
      setErrorMsg(e instanceof Error ? e.message : "Setup failed.");
    }
  }

  async function onEnable() {
    if (!signalId) return;
    setStep("enabling");
    setErrorMsg(null);
    const res = await enableSignal(signalId);
    if (!res.ok) {
      setStep("error");
      setErrorMsg(res.error);
      return;
    }
    setStep("enabled");
  }

  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">
        Watch proposal
      </div>
      <div className="font-medium">{metricLabel || "signal"}</div>
      <div className="text-xs text-muted-foreground">via {source}</div>

      {errorMsg && (
        <div className="mt-2 rounded bg-destructive/10 p-2 text-xs text-destructive">
          {errorMsg}
        </div>
      )}

      <div className="mt-3 flex items-center gap-2">
        {step === "idle" && (
          <button
            type="button"
            className="rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium hover:bg-muted"
            onClick={onSetup}
            disabled={!metric}
          >
            Set up this watch →
          </button>
        )}
        {step === "setting-up" && (
          <span className="text-sm text-muted-foreground">Setting up…</span>
        )}
        {step === "ready" && (
          <button
            type="button"
            className="rounded-md border border-primary bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
            onClick={onEnable}
          >
            Enable watching →
          </button>
        )}
        {step === "enabling" && (
          <span className="text-sm text-muted-foreground">Enabling…</span>
        )}
        {step === "enabled" && (
          <div className="flex items-center gap-3 text-sm">
            <span className="font-medium text-primary">Watching ✓</span>
            <Link
              href={`/settings/observers/${signalId}/runs`}
              className="text-xs text-muted-foreground underline"
            >
              View runs
            </Link>
          </div>
        )}
        {step === "error" && (
          <button
            type="button"
            className="rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium hover:bg-muted"
            onClick={() => {
              setStep("idle");
              setErrorMsg(null);
            }}
          >
            Try again
          </button>
        )}
      </div>
    </div>
  );
}

function MemoryLookupBody({ payload }: { payload: unknown }) {
  const p = asObj(payload);
  const ids = Array.isArray(p.memoryIds) ? (p.memoryIds as string[]) : [];
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">Memory</div>
      <div className="text-sm">
        {ids.length === 0
          ? "No matches."
          : `${ids.length} match${ids.length === 1 ? "" : "es"} — see chips below.`}
      </div>
    </div>
  );
}

function UnknownBody({ kind, payload }: { kind: string; payload: unknown }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{kind}</div>
      <pre className="mt-1 overflow-x-auto rounded bg-muted/40 p-2 font-mono text-xs">
        {JSON.stringify(payload, null, 2)}
      </pre>
    </div>
  );
}

function asObj(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}
