// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import AskBbc from "./AskBbc";

const routeTask = vi.fn();
vi.mock("@/lib/studio/route-task-action", () => ({
  routeTask: (...a: unknown[]) => routeTask(...a),
}));

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const TWO_CANDIDATES = {
  ok: true,
  candidates: [
    { templateId: "eng:adr-draft", owningRole: "engineering", label: "Draft an ADR", rationale: "fits the decision" },
    { templateId: "marketing:custom", owningRole: "marketing", label: "Custom", rationale: "free-form fallback" },
  ],
};

beforeEach(() => {
  routeTask.mockReset();
  push.mockReset();
});
afterEach(cleanup);

describe("AskBbc", () => {
  it("typing + submit calls routeTask and renders candidate cards", async () => {
    routeTask.mockResolvedValue(TWO_CANDIDATES);
    render(<AskBbc />);
    fireEvent.change(screen.getByLabelText(/tell bbc/i), {
      target: { value: "decide on hosting provider" },
    });
    fireEvent.click(screen.getByRole("button", { name: /ask bbc/i }));
    await waitFor(() => expect(routeTask).toHaveBeenCalledTimes(1));
    expect(screen.getByText("Draft an ADR")).toBeTruthy();
    expect(screen.getByText("fits the decision")).toBeTruthy();
    // role badge renders the studio's display label (STUDIO_PRESENTATION)
    expect(screen.getByText("Engineering")).toBeTruthy();
  });

  it("clicking a candidate deep-links into the studio with template + task", async () => {
    routeTask.mockResolvedValue(TWO_CANDIDATES);
    render(<AskBbc />);
    fireEvent.change(screen.getByLabelText(/tell bbc/i), {
      target: { value: "decide on hosting provider" },
    });
    fireEvent.click(screen.getByRole("button", { name: /ask bbc/i }));
    await waitFor(() => expect(screen.getByText("Draft an ADR")).toBeTruthy());
    fireEvent.click(screen.getByText("Draft an ADR"));
    expect(push).toHaveBeenCalledWith(
      "/studio/engineering?template=eng%3Aadr-draft&task=decide%20on%20hosting%20provider",
    );
  });

  it("disables submit for a too-short task", () => {
    render(<AskBbc />);
    fireEvent.change(screen.getByLabelText(/tell bbc/i), { target: { value: "hi" } });
    expect(screen.getByRole("button", { name: /ask bbc/i })).toHaveProperty("disabled", true);
  });
});
