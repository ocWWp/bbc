"use client";
// Marketing Studio client -- now a thin wrapper over the shared
// TemplateFirstStudioClient. The bespoke task-first proposing/picking stages
// moved to the "Ask BBC" router (Phase P Step 1b Step 6); marketing keeps,
// via config: plan-confirm, overrides, the FULL review (Approve/Reject +
// author hint), and the ?rerun= boot path (passed as initialSeed).
import TemplateFirstStudioClient from "@/components/studio/TemplateFirstStudioClient";
import type { StudioSeed } from "@/components/studio/template-first-config";
import type { ClientTemplate } from "@/lib/studio/templates/registry";
import {
  acceptStudioRun, deactivateStudioOverride, listActiveOverrides,
  proposeOverride, rejectStudioRun, runWorkflow, saveStudioTemplateOverride,
} from "./actions";

export type RerunSeed = StudioSeed; // page.tsx imports this name
type AuthorHint = { name?: string; handle?: string; productName?: string; role?: string };
type Props = { templates: ClientTemplate[]; authorHint?: AuthorHint; rerunSeed?: RerunSeed };

export default function StudioClient({ templates, authorHint, rerunSeed }: Props) {
  return (
    <TemplateFirstStudioClient
      initialSeed={rerunSeed}
      config={{
        role: "marketing",
        templates,
        runWorkflow,
        overrides: {
          proposeAction: proposeOverride,
          saveAction: saveStudioTemplateOverride,
          listAction: listActiveOverrides,
          deactivateAction: deactivateStudioOverride,
        },
        review: { kind: "full", acceptAction: acceptStudioRun, rejectAction: rejectStudioRun, authorHint },
        copy: {
          taskLabel: "What do you want to make?",
          taskPlaceholder: "Draft a launch tweet for our v1.0 announcement",
          generateLabel: "Generate",
        },
      }}
    />
  );
}
