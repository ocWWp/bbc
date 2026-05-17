"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { acceptRun, rejectRun } from "./actions";
import type { FiledArtifact, FiledProposal } from "@/lib/studio/writebacks";

type AcceptOutcome = {
  proposals: FiledProposal[];
  artifacts: FiledArtifact[];
};

export default function RunActions({ runId }: { runId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<AcceptOutcome | null>(null);
  const [pending, startTransition] = useTransition();

  const onAccept = () => {
    setError(null);
    setOutcome(null);
    startTransition(async () => {
      const r = await acceptRun(runId);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setOutcome({ proposals: r.proposals, artifacts: r.artifacts });
    });
  };

  const onReject = () => {
    setError(null);
    setOutcome(null);
    startTransition(async () => {
      const r = await rejectRun(runId);
      if (!r.ok) setError(r.error);
    });
  };

  if (outcome) {
    const total = outcome.proposals.length + outcome.artifacts.length;
    if (total === 0) {
      return <div className="text-xs text-muted-foreground">Accepted.</div>;
    }
    return (
      <div className="flex flex-col items-end gap-2 text-right">
        <div className="text-xs font-medium">Accepted.</div>
        {outcome.artifacts.length > 0 && (
          <div className="text-xs text-muted-foreground">
            {outcome.artifacts.length} audit row
            {outcome.artifacts.length === 1 ? "" : "s"} written to memory.
          </div>
        )}
        {outcome.proposals.length > 0 && (
          <Link
            href="/ops"
            className="text-xs underline hover:text-foreground"
          >
            {outcome.proposals.length} proposal
            {outcome.proposals.length === 1 ? "" : "s"} filed — review in /ops
          </Link>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex items-center gap-2">
        <Button variant="outline" onClick={onReject} disabled={pending}>
          Reject
        </Button>
        <Button onClick={onAccept} disabled={pending}>
          {pending ? "…" : "Accept"}
        </Button>
      </div>
      {error && <div className="text-xs text-red-500">{error}</div>}
    </div>
  );
}
