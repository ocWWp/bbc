// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import StudioClient, { type RerunSeed } from "./StudioClient";
import type { ClientTemplate } from "@/lib/studio/templates/registry";

// StudioClient is now a thin wrapper over TemplateFirstStudioClient. The shared
// client calls previewPlan from @/lib/studio/preview-plan-action (not ./actions)
// and uses next/navigation for deep-link URL cleanup -- both are mocked here.
const previewPlan = vi.fn();
vi.mock("@/lib/studio/preview-plan-action", () => ({
  previewPlan: (...a: unknown[]) => previewPlan(...a),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => "/studio/marketing",
}));

const runWorkflow = vi.fn();
const acceptStudioRun = vi.fn();
const rejectStudioRun = vi.fn();
vi.mock("./actions", () => ({
  runWorkflow: (...a: unknown[]) => runWorkflow(...a),
  acceptStudioRun: (...a: unknown[]) => acceptStudioRun(...a),
  rejectStudioRun: (...a: unknown[]) => rejectStudioRun(...a),
  proposeOverride: vi.fn(),
  saveStudioTemplateOverride: vi.fn(),
  listActiveOverrides: vi.fn(async () => ({ ok: true, overrides: [] })),
  deactivateStudioOverride: vi.fn(async () => ({ ok: true })),
}));

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
  task: "draft a launch tweet",
  inputs: {},
};

const PLAN_SUMMARY = "Generate an x post grounded in 0 pieces of your company memory.";

afterEach(cleanup);
beforeEach(() => {
  previewPlan.mockReset();
  runWorkflow.mockReset();
  previewPlan.mockResolvedValue({
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
  runWorkflow.mockResolvedValue({
    ok: true,
    runId: "run-1",
    blocks: [],
    citedMemoryIds: [],
    citedMemories: [],
    droppedCitationCount: 0,
  });
});

describe("StudioClient (marketing wrapper)", () => {
  it("renders the template grid", () => {
    render(<StudioClient templates={TEMPLATES} />);
    expect(screen.getByText("What do you want to make?")).toBeTruthy();
    expect(screen.getByText("Single X post")).toBeTruthy();
  });

  it("boots into configuring from rerunSeed", () => {
    render(<StudioClient templates={TEMPLATES} rerunSeed={SEED} />);
    // the seeded task is in the textarea, and the Generate button is present
    expect(screen.getByDisplayValue("draft a launch tweet")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Generate" })).toBeTruthy();
  });

  it("submitting calls previewPlan, not runWorkflow", async () => {
    render(<StudioClient templates={TEMPLATES} rerunSeed={SEED} />);
    fireEvent.click(screen.getByRole("button", { name: "Generate" }));
    expect(await screen.findByText(PLAN_SUMMARY)).toBeTruthy();
    expect(previewPlan).toHaveBeenCalledTimes(1);
    expect(runWorkflow).not.toHaveBeenCalled();
  });

  it("confirming the plan runs the workflow and wires the full Approve/Reject review", async () => {
    render(<StudioClient templates={TEMPLATES} rerunSeed={SEED} />);
    fireEvent.click(screen.getByRole("button", { name: "Generate" }));
    await screen.findByText(PLAN_SUMMARY);
    fireEvent.click(screen.getByRole("button", { name: /confirm & generate/i }));
    await waitFor(() => expect(runWorkflow).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole("button", { name: /approve/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /reject/i })).toBeTruthy();
  });
});
