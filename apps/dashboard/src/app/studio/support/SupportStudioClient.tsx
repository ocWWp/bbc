"use client";
import TemplateFirstStudioClient from "@/components/studio/TemplateFirstStudioClient";
import type { ClientSupportTemplate } from "@/lib/studio/support-templates/registry";
import type { StudioSeed } from "@/components/studio/template-first-config";
import {
  deactivateSupportStudioOverride, listActiveSupportOverrides, proposeSupportOverride,
  runSupportWorkflow, saveSupportStudioTemplateOverride,
} from "./actions";

type Props = { templates: ClientSupportTemplate[]; initialSeed?: StudioSeed };

export default function SupportStudioClient({ templates, initialSeed }: Props) {
  return (
    <TemplateFirstStudioClient
      initialSeed={initialSeed}
      config={{
        role: "support",
        templates,
        runWorkflow: runSupportWorkflow,
        overrides: {
          proposeAction: proposeSupportOverride,
          saveAction: saveSupportStudioTemplateOverride,
          listAction: listActiveSupportOverrides,
          deactivateAction: deactivateSupportStudioOverride,
        },
        review: { kind: "light" },
        copy: {
          taskLabel: "What needs a reply?",
          taskPlaceholder: "e.g. Paying customer is asking why our pricing went up last month.",
          generateLabel: "Draft reply",
        },
      }}
    />
  );
}
