"use client";
import TemplateFirstStudioClient from "@/components/studio/TemplateFirstStudioClient";
import type { ClientHrTemplate } from "@/lib/studio/hr-templates/registry";
import {
  deactivateHrStudioOverride, listActiveHrOverrides, proposeHrOverride,
  runHrWorkflow, saveHrStudioTemplateOverride,
} from "./actions";

type Props = { templates: ClientHrTemplate[] };

export default function HrStudioClient({ templates }: Props) {
  return (
    <TemplateFirstStudioClient
      config={{
        role: "hr",
        templates,
        runWorkflow: runHrWorkflow,
        overrides: {
          proposeAction: proposeHrOverride,
          saveAction: saveHrStudioTemplateOverride,
          listAction: listActiveHrOverrides,
          deactivateAction: deactivateHrStudioOverride,
        },
        review: { kind: "light" },
        copy: {
          taskLabel: "What are you working on?",
          taskPlaceholder: "e.g. We're opening our first product designer role and I need the job description.",
          generateLabel: "Generate draft",
        },
      }}
    />
  );
}
