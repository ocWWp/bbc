"use client";
import TemplateFirstStudioClient from "@/components/studio/TemplateFirstStudioClient";
import type { ClientDesignerTemplate } from "@/lib/studio/designer-templates/registry";
import type { StudioSeed } from "@/components/studio/template-first-config";
import {
  deactivateDesignerStudioOverride, listActiveDesignerOverrides, proposeDesignerOverride,
  runDesignerWorkflow, saveDesignerStudioTemplateOverride,
} from "./actions";

type Props = { templates: ClientDesignerTemplate[]; initialSeed?: StudioSeed };

export default function DesignerStudioClient({ templates, initialSeed }: Props) {
  return (
    <TemplateFirstStudioClient
      initialSeed={initialSeed}
      config={{
        role: "designer",
        templates,
        runWorkflow: runDesignerWorkflow,
        overrides: {
          proposeAction: proposeDesignerOverride,
          saveAction: saveDesignerStudioTemplateOverride,
          listAction: listActiveDesignerOverrides,
          deactivateAction: deactivateDesignerStudioOverride,
        },
        review: { kind: "light" },
        copy: {
          taskLabel: "What are you working on?",
          taskPlaceholder: "e.g. The empty state on /memory currently says 'no items yet' — needs a designer pass.",
          generateLabel: "Generate",
        },
      }}
    />
  );
}
