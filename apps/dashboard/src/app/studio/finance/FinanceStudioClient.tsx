"use client";
import TemplateFirstStudioClient from "@/components/studio/TemplateFirstStudioClient";
import type { ClientFinanceTemplate } from "@/lib/studio/finance-templates/registry";
import type { StudioSeed } from "@/components/studio/template-first-config";
import {
  deactivateFinanceStudioOverride, listActiveFinanceOverrides, proposeFinanceOverride,
  runFinanceWorkflow, saveFinanceStudioTemplateOverride,
} from "./actions";

type Props = { templates: ClientFinanceTemplate[]; initialSeed?: StudioSeed };

export default function FinanceStudioClient({ templates, initialSeed }: Props) {
  return (
    <TemplateFirstStudioClient
      initialSeed={initialSeed}
      config={{
        role: "finance",
        templates,
        runWorkflow: runFinanceWorkflow,
        overrides: {
          proposeAction: proposeFinanceOverride,
          saveAction: saveFinanceStudioTemplateOverride,
          listAction: listActiveFinanceOverrides,
          deactivateAction: deactivateFinanceStudioOverride,
        },
        review: { kind: "light" },
        copy: {
          taskLabel: "What are you working on?",
          taskPlaceholder: "e.g. The board meeting is Thursday and I need the Q3 financials section written up from our actuals.",
          generateLabel: "Generate",
        },
      }}
    />
  );
}
