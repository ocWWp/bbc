"use client";
import TemplateFirstStudioClient from "@/components/studio/TemplateFirstStudioClient";
import type { ClientFounderTemplate } from "@/lib/studio/founder-templates/registry";
import type { StudioSeed } from "@/components/studio/template-first-config";
import { runFounderWorkflow } from "./actions";

type Props = { templates: ClientFounderTemplate[]; initialSeed?: StudioSeed };

// Founder has no override flow -- `overrides` is omitted.
export default function FounderStudioClient({ templates, initialSeed }: Props) {
  return (
    <TemplateFirstStudioClient
      initialSeed={initialSeed}
      config={{
        role: "founder",
        templates,
        runWorkflow: runFounderWorkflow,
        review: { kind: "light" },
        copy: {
          taskLabel: "What are you working on?",
          taskPlaceholder: "e.g. Drafting our November investor update — we just hit $50k MRR and shipped the OSS launch.",
          generateLabel: "Generate",
        },
      }}
    />
  );
}
