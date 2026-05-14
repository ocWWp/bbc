"use client";
import TemplateFirstStudioClient from "@/components/studio/TemplateFirstStudioClient";
import type { ClientEngTemplate } from "@/lib/studio/eng-templates/registry";
import {
  deactivateEngStudioOverride, listActiveEngOverrides, proposeEngOverride,
  runEngineeringWorkflow, saveEngStudioTemplateOverride,
} from "./actions";

type Props = { templates: ClientEngTemplate[] };

export default function EngStudioClient({ templates }: Props) {
  return (
    <TemplateFirstStudioClient
      config={{
        role: "engineering",
        templates,
        runWorkflow: runEngineeringWorkflow,
        overrides: {
          proposeAction: proposeEngOverride,
          saveAction: saveEngStudioTemplateOverride,
          listAction: listActiveEngOverrides,
          deactivateAction: deactivateEngStudioOverride,
        },
        review: { kind: "light" },
        copy: {
          taskLabel: "What are you working on?",
          taskPlaceholder: "e.g. We're deciding whether to keep Vercel or move to Cloudflare Workers for the dashboard.",
          generateLabel: "Generate",
        },
      }}
    />
  );
}
