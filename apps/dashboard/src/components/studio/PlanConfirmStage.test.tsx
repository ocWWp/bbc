// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { PlanConfirmStage } from "./PlanConfirmStage";
import type { PlanPreview } from "@/lib/studio/plan-preview";

afterEach(cleanup);

const PLAN: PlanPreview = {
  templateId: "marketing:single-x-post",
  templateLabel: "Single X post",
  task: "draft a launch tweet",
  inputs: { tone: "punchy" },
  planSummary:
    'Generate an x post using the "Single X post" template, grounded in 2 pieces of your company memory. Output goes to the review queue -- nothing is saved or sent until you approve it.',
  candidateMemories: [
    { id: "m1", kind: "decision", label: "Ship invite-only first" },
    { id: "m2", kind: "vendor", label: "Vercel (hosting)" },
  ],
  alwaysOnContext: ["Voice", "Product positioning"],
};

describe("PlanConfirmStage", () => {
  it("renders the plan summary and candidate memory labels", () => {
    render(
      <PlanConfirmStage plan={PLAN} onConfirm={() => {}} onBack={() => {}} disabled={false} />,
    );
    expect(screen.getByText(PLAN.planSummary)).toBeTruthy();
    expect(screen.getByText("Ship invite-only first")).toBeTruthy();
    expect(screen.getByText("Vercel (hosting)")).toBeTruthy();
  });

  it("fires onConfirm and onBack", () => {
    const onConfirm = vi.fn();
    const onBack = vi.fn();
    render(
      <PlanConfirmStage
        plan={PLAN}
        onConfirm={onConfirm}
        onBack={onBack}
        disabled={false}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /confirm & generate/i }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: /^back$/i }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("disables the action buttons when disabled", () => {
    render(
      <PlanConfirmStage plan={PLAN} onConfirm={() => {}} onBack={() => {}} disabled={true} />,
    );
    const confirm = screen.getByRole("button", {
      name: /confirm & generate/i,
    }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
  });

  it("surfaces always-on context (voice / product) separately from candidates", () => {
    render(
      <PlanConfirmStage plan={PLAN} onConfirm={() => {}} onBack={() => {}} disabled={false} />,
    );
    expect(screen.getByText("Voice · Product positioning")).toBeTruthy();
  });

  it("shows the honest empty state only when nothing — not even always-on — is in scope", () => {
    render(
      <PlanConfirmStage
        plan={{ ...PLAN, candidateMemories: [], alwaysOnContext: [] }}
        onConfirm={() => {}}
        onBack={() => {}}
        disabled={false}
      />,
    );
    expect(screen.getByText(/No company memory matched this task/i)).toBeTruthy();
  });

  it("does not claim 'nothing matched' when always-on context is present", () => {
    render(
      <PlanConfirmStage
        plan={{ ...PLAN, candidateMemories: [] }}
        onConfirm={() => {}}
        onBack={() => {}}
        disabled={false}
      />,
    );
    expect(screen.queryByText(/No company memory matched this task/i)).toBeNull();
    expect(screen.getByText(/No task-specific memory matched/i)).toBeTruthy();
    expect(screen.getByText("Voice · Product positioning")).toBeTruthy();
  });
});
