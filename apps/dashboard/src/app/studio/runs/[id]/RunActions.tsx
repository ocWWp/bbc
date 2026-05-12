"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { acceptRun, rejectRun } from "./actions";

export default function RunActions({ runId }: { runId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const onAccept = () => {
    setError(null);
    startTransition(async () => {
      const r = await acceptRun(runId);
      if (!r.ok) setError(r.error);
    });
  };

  const onReject = () => {
    setError(null);
    startTransition(async () => {
      const r = await rejectRun(runId);
      if (!r.ok) setError(r.error);
    });
  };

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
