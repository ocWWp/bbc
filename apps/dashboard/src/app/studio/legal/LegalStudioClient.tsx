"use client";
import TemplateFirstStudioClient from "@/components/studio/TemplateFirstStudioClient";
import type { ClientLegalTemplate } from "@/lib/studio/legal-templates/registry";
import type { StudioSeed } from "@/components/studio/template-first-config";
import type { TriageLevel } from "@/lib/studio/legal-templates/types";
import {
  deactivateLegalStudioOverride, listActiveLegalOverrides, proposeLegalOverride,
  runLegalWorkflow, saveLegalStudioTemplateOverride,
} from "./actions";

type Props = { templates: ClientLegalTemplate[]; initialSeed?: StudioSeed };

// Legal-only: per-doc-type triage chip + note. Moved out of the old bespoke
// client; surfaced via the shared client's templateBadge/templateConfigureNote
// config hooks (UI-SPEC §2 -- this is a drafting assistant, never an advisor).
const TRIAGE_STYLE: Record<TriageLevel, { label: string; className: string }> = {
  "attorney-required": {
    label: "Attorney required",
    className: "text-red-600 dark:text-red-400 border-red-500/40 bg-red-500/10",
  },
  "attorney-recommended": {
    label: "Attorney recommended",
    className: "text-amber-700 dark:text-amber-400 border-amber-500/40 bg-amber-500/10",
  },
  routine: {
    label: "Routine",
    className: "text-emerald-700 dark:text-emerald-400 border-emerald-500/40 bg-emerald-500/10",
  },
};

function TriageChip({ level }: { level: TriageLevel }) {
  const s = TRIAGE_STYLE[level];
  return (
    <span
      className={
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide " +
        s.className
      }
    >
      {s.label}
    </span>
  );
}

export default function LegalStudioClient({ templates, initialSeed }: Props) {
  return (
    <TemplateFirstStudioClient
      initialSeed={initialSeed}
      config={{
        role: "legal",
        templates,
        runWorkflow: runLegalWorkflow,
        overrides: {
          proposeAction: proposeLegalOverride,
          saveAction: saveLegalStudioTemplateOverride,
          listAction: listActiveLegalOverrides,
          deactivateAction: deactivateLegalStudioOverride,
        },
        review: { kind: "light" },
        templateBadge: (t) => <TriageChip level={t.triageLevel} />,
        templateConfigureNote: (t) =>
          t.triageNote ? (
            <div className="text-xs text-muted-foreground rounded-md border border-border bg-muted/40 px-2.5 py-1.5">
              {t.triageNote}
            </div>
          ) : null,
        copy: {
          taskLabel: "What are you working on?",
          taskPlaceholder: "e.g. We're bringing on a freelance designer next week and need a contractor agreement.",
          generateLabel: "Generate draft",
        },
      }}
    />
  );
}
