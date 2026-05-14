"use client";
import TemplateFirstStudioClient from "@/components/studio/TemplateFirstStudioClient";
import type { ClientEngTemplate } from "@/lib/studio/eng-templates/registry";
import type { StudioSeed } from "@/components/studio/template-first-config";
import {
  deactivateEngStudioOverride, listActiveEngOverrides, proposeEngOverride,
  runEngineeringWorkflow, saveEngStudioTemplateOverride,
} from "./actions";

type Props = { templates: ClientEngTemplate[]; initialSeed?: StudioSeed };

export default function EngStudioClient({ templates, initialSeed }: Props) {
  return (
    <TemplateFirstStudioClient
      initialSeed={initialSeed}
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
