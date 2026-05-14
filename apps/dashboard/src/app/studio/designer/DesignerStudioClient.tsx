"use client";
import TemplateFirstStudioClient from "@/components/studio/TemplateFirstStudioClient";
import type { ClientDesignerTemplate } from "@/lib/studio/designer-templates/registry";
import {
  deactivateDesignerStudioOverride, listActiveDesignerOverrides, proposeDesignerOverride,
  runDesignerWorkflow, saveDesignerStudioTemplateOverride,
} from "./actions";

type Props = { templates: ClientDesignerTemplate[] };

export default function DesignerStudioClient({ templates }: Props) {
  return (
    <TemplateFirstStudioClient
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
