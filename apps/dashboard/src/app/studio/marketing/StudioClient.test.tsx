// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import StudioClient, { type RerunSeed } from "./StudioClient";
import type { ClientTemplate } from "@/lib/studio/templates/registry";

// All of ./actions is mocked: the plan-confirming stage must call previewPlan
// (not runWorkflow) on submit, and runWorkflow only on explicit confirm.
vi.mock("./actions", () => ({
  previewPlan: vi.fn(),
  runWorkflow: vi.fn(),
  proposeWorkflows: vi.fn(),
  acceptStudioRun: vi.fn(),
  rejectStudioRun: vi.fn(),
  proposeOverride: vi.fn(),
  saveStudioTemplateOverride: vi.fn(),
  listActiveOverrides: vi.fn(async () => ({ ok: true, overrides: [] })),
  deactivateStudioOverride: vi.fn(async () => ({ ok: true })),
}));

import { previewPlan, runWorkflow } from "./actions";

const previewPlanMock = previewPlan as ReturnType<typeof vi.fn>;
const runWorkflowMock = runWorkflow as ReturnType<typeof vi.fn>;

const TEMPLATES: ClientTemplate[] = [
  {
    id: "marketing:single-x-post",
    label: "Single X post",
    hint: "one punchy post",
    kind: "x_post",
    firstUseInputs: [],
  },
];

const SEED: RerunSeed = {
  templateId: "marketing:single-x-post",
  label: "Single X post",
  task: "draft a launch tweet",
  inputs: {},
};

const PLAN_SUMMARY =
  "Generate an x post grounded in 0 pieces of your company memory.";

afterEach(cleanup);
beforeEach(() => {
  previewPlanMock.mockReset();
  runWorkflowMock.mockReset();
  previewPlanMock.mockResolvedValue({
    ok: true,
    plan: {
      templateId: "marketing:single-x-post",
      templateLabel: "Single X post",
      task: SEED.task,
      inputs: {},
      planSummary: PLAN_SUMMARY,
      candidateMemories: [],
      alwaysOnContext: [],
    },
  });
  runWorkflowMock.mockResolvedValue({
    ok: true,
    runId: "run-1",
    blocks: [],
    citedMemoryIds: [],
    citedMemories: [],
    droppedCitationCount: 0,
  });
});

describe("StudioClient — plan-confirming stage", () => {
  it("submitting from configure calls previewPlan, not runWorkflow", async () => {
    render(<StudioClient templates={TEMPLATES} rerunSeed={SEED} />);
    fireEvent.click(screen.getByRole("button", { name: /run workflow/i }));
    expect(await screen.findByText(PLAN_SUMMARY)).toBeTruthy();
    expect(previewPlanMock).toHaveBeenCalledTimes(1);
    expect(runWorkflowMock).not.toHaveBeenCalled();
  });

  it("'Confirm & generate' runs the workflow and advances past the plan", async () => {
    render(<StudioClient templates={TEMPLATES} rerunSeed={SEED} />);
    fireEvent.click(screen.getByRole("button", { name: /run workflow/i }));
    await screen.findByText(PLAN_SUMMARY);
    fireEvent.click(screen.getByRole("button", { name: /confirm & generate/i }));
    await waitFor(() => expect(runWorkflowMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByText(PLAN_SUMMARY)).toBeNull());
  });

  it("'Back' returns to configure without running the workflow", async () => {
    render(<StudioClient templates={TEMPLATES} rerunSeed={SEED} />);
    fireEvent.click(screen.getByRole("button", { name: /run workflow/i }));
    await screen.findByText(PLAN_SUMMARY);
    fireEvent.click(screen.getByRole("button", { name: /^back$/i }));
    expect(await screen.findByRole("button", { name: /run workflow/i })).toBeTruthy();
    expect(runWorkflowMock).not.toHaveBeenCalled();
  });
});
