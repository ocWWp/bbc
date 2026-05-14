// The per-role configuration TemplateFirstStudioClient is parameterized by.
// Everything that genuinely diverges between the 8 studios lives here; the
// client component itself has zero role-specific branching.
import type { ReactNode } from "react";
import type { StudioRole } from "@/lib/studio/template-id";
import type { OutputBlock } from "@/lib/studio/output-blocks";
import type { CitedMemory } from "@/components/studio/OutputBlocks";

// Structural shape every Client<Role>Template satisfies (legal adds more).
export type StudioClientTemplate = {
  id: string;
  label: string;
  hint: string;
  kind: string;
  firstUseInputs: Array<{
    id: string; label: string; hint: string; required: boolean;
    kind: "text" | "select" | "tone"; options?: string[]; default?: string;
  }>;
};

export type RunWorkflowResult =
  | { ok: true; runId: string; blocks: OutputBlock[]; citedMemories: CitedMemory[] }
  | { ok: false; error: string };

// Override feature wiring (EditWorkflowChat + ActiveOverridesPill). Omitted by
// founder, which has no override flow.
export type OverridesConfig = {
  proposeAction: Parameters<typeof import("@/components/studio/EditWorkflowChat")["EditWorkflowChat"]>[0]["proposeAction"];
  saveAction: Parameters<typeof import("@/components/studio/EditWorkflowChat")["EditWorkflowChat"]>[0]["saveAction"];
  listAction: Parameters<typeof import("@/components/studio/ActiveOverridesPill")["ActiveOverridesPill"]>[0]["listAction"];
  deactivateAction: Parameters<typeof import("@/components/studio/ActiveOverridesPill")["ActiveOverridesPill"]>[0]["deactivateAction"];
};

// Review-stage style. "light" = edit-chat + "New run" (the 7). "full" = inline
// Approve/Reject + author hint (marketing only). Preserves current per-role
// behavior -- see STEP-1B-DESIGN.md "Decisions locked".
export type ReviewConfig =
  | { kind: "light" }
  | {
      kind: "full";
      acceptAction: (runId: string) => Promise<{ ok: true } | { ok: false; error: string }>;
      rejectAction: (runId: string) => Promise<{ ok: true } | { ok: false; error: string }>;
      authorHint?: { name?: string; handle?: string; productName?: string; role?: string };
    };

export type TemplateFirstConfig<T extends StudioClientTemplate> = {
  role: StudioRole;
  templates: T[];
  runWorkflow: (templateId: string, task: string, inputs: Record<string, string>) => Promise<RunWorkflowResult>;
  overrides?: OverridesConfig;
  review: ReviewConfig;
  // Optional per-template adornments. Legal supplies both (triage chip + note).
  templateBadge?: (t: T) => ReactNode;
  templateConfigureNote?: (t: T) => ReactNode;
  copy: {
    taskLabel: string;       // "What are you working on?" etc.
    taskPlaceholder: string;
    generateLabel: string;   // "Generate" / "Generate draft"
  };
};

// Boot state -- lets a page wrapper drop the client straight into `configuring`.
// Marketing's ?rerun= path and Step 5's ?template=&task= deep-link both produce
// this shape.
export type StudioSeed = {
  templateId: string;
  task: string;
  inputs: Record<string, string>;
};

// Re-exported: CitedMemory is part of RunWorkflowResult, so the config module
// is the single import site for the whole shared-client contract.
export type { CitedMemory };
