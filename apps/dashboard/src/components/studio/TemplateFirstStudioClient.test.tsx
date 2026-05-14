// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import TemplateFirstStudioClient from "./TemplateFirstStudioClient";
import type { TemplateFirstConfig, StudioClientTemplate, RunWorkflowResult } from "./template-first-config";

const previewPlan = vi.fn();
vi.mock("@/lib/studio/preview-plan-action", () => ({ previewPlan: (...a: unknown[]) => previewPlan(...a) }));

// TemplateFirstStudioClient uses useRouter/usePathname (deep-link URL cleanup).
// Without this mock, render() hits Next's app-router invariant before assertions.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => "/studio/engineering",
}));

const TPL: StudioClientTemplate = {
  id: "eng:adr-draft", label: "Draft an ADR", hint: "decision record", kind: "plain",
  firstUseInputs: [],
};

function baseConfig(over: Partial<TemplateFirstConfig<StudioClientTemplate>> = {}): TemplateFirstConfig<StudioClientTemplate> {
  return {
    role: "engineering", templates: [TPL],
    runWorkflow: vi.fn(async (): Promise<RunWorkflowResult> => ({ ok: true, runId: "r1", blocks: [], citedMemories: [] })),
    review: { kind: "light" },
    copy: { taskLabel: "What are you working on?", taskPlaceholder: "e.g. ...", generateLabel: "Generate" },
    ...over,
  };
}

beforeEach(() => {
  previewPlan.mockReset();
  previewPlan.mockResolvedValue({ ok: true, plan: {
    templateId: "eng:adr-draft", templateLabel: "Draft an ADR", task: "decide on hosting",
    inputs: {}, planSummary: "Generate a plain doc...", candidateMemories: [], alwaysOnContext: [],
  }});
});
afterEach(cleanup);

describe("TemplateFirstStudioClient", () => {
  it("renders the task input and template grid", () => {
    render(<TemplateFirstStudioClient config={baseConfig()} />);
    expect(screen.getByText("What are you working on?")).toBeTruthy();
    expect(screen.getByText("Draft an ADR")).toBeTruthy();
  });

  it("configuring -> submit calls previewPlan, NOT runWorkflow, and shows the plan", async () => {
    const config = baseConfig();
    render(<TemplateFirstStudioClient config={config} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "decide on hosting provider" } });
    fireEvent.click(screen.getByText("Draft an ADR"));            // -> configuring
    fireEvent.click(screen.getByText("Generate"));                 // -> previewPlan
    await waitFor(() => expect(previewPlan).toHaveBeenCalledTimes(1));
    expect(config.runWorkflow).not.toHaveBeenCalled();
    expect(screen.getByText(/Generate a plain doc/)).toBeTruthy(); // plan summary visible
  });

  it("confirming the plan calls runWorkflow and advances to review", async () => {
    const config = baseConfig();
    render(<TemplateFirstStudioClient config={config} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "decide on hosting provider" } });
    fireEvent.click(screen.getByText("Draft an ADR"));
    fireEvent.click(screen.getByText("Generate"));
    await waitFor(() => expect(screen.getByText(/Confirm/)).toBeTruthy());
    fireEvent.click(screen.getByText(/Confirm/));
    await waitFor(() => expect(config.runWorkflow).toHaveBeenCalledTimes(1));
  });

  it("boots straight into configuring from initialSeed", () => {
    render(<TemplateFirstStudioClient config={baseConfig()} initialSeed={{ templateId: "eng:adr-draft", task: "seeded task", inputs: {} }} />);
    // configuring stage shows the picked template + the seeded task
    expect(screen.getByDisplayValue("seeded task")).toBeTruthy();
  });
});
