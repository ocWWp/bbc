"use client";

// Compact pill that shows the count of active customizations for a workflow
// template + an inline list with deactivate buttons. Actions are injected
// (list/deactivate) so the pill can be reused across studios.

import { useCallback, useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import type { OverrideKind } from "./EditWorkflowChat";

export type ActiveOverrideSummary = {
  id: string;
  kind: OverrideKind;
  summary: string;
  createdAt: string;
};

type ListResult =
  | { ok: true; overrides: ActiveOverrideSummary[] }
  | { ok: false; error: string };

type DeactivateResult = { ok: true } | { ok: false; error: string };

type Props = {
  templateId: string;
  listAction: (templateId: string) => Promise<ListResult>;
  deactivateAction: (overrideId: string) => Promise<DeactivateResult>;
};

export function ActiveOverridesPill({ templateId, listAction, deactivateAction }: Props) {
  const [overrides, setOverrides] = useState<ActiveOverrideSummary[] | null>(null);
  const [open, setOpen] = useState(false);
  const [, startTransition] = useTransition();

  const load = useCallback(() => {
    startTransition(async () => {
      const res = await listAction(templateId);
      setOverrides(res.ok ? res.overrides : []);
    });
  }, [templateId, listAction]);

  useEffect(() => {
    load();
  }, [load]);

  const handleDeactivate = useCallback(
    (id: string) => {
      startTransition(async () => {
        const res = await deactivateAction(id);
        if (res.ok) {
          setOverrides((prev) => (prev ?? []).filter((o) => o.id !== id));
        }
      });
    },
    [deactivateAction],
  );

  if (!overrides || overrides.length === 0) return null;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-full border border-studio-accent/40 bg-studio-accent/10 px-2.5 py-0.5 text-[11px] font-semibold text-studio-accent hover:bg-studio-accent/20 transition-colors"
        aria-expanded={open}
      >
        <span className="size-1.5 rounded-full bg-studio-accent" />
        {overrides.length} customization{overrides.length === 1 ? "" : "s"}
      </button>
      {open ? (
        <div className="absolute z-20 mt-2 w-[320px] rounded-xl border bg-popover text-popover-foreground shadow-lg p-2 left-0">
          <ul className="divide-y">
            {overrides.map((o) => (
              <li key={o.id} className="py-2 px-1 flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                    {o.kind.replace(/_/g, " ")}
                  </div>
                  <div className="text-[13px] leading-snug">{o.summary}</div>
                </div>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => handleDeactivate(o.id)}
                  aria-label="Deactivate customization"
                  title="Deactivate"
                >
                  ✕
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
