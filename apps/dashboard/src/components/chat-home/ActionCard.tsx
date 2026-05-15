"use client";

import Link from "next/link";

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

function WatchProposedBody({ payload }: { payload: unknown }) {
  const p = asObj(payload);
  const metric = typeof p.metric === "string" ? p.metric : "signal";
  const source = typeof p.source === "string" ? p.source : "";
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">Watch proposal</div>
      <div className="font-medium">{metric}</div>
      {source ? <div className="text-xs text-muted-foreground">via {source}</div> : null}
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
