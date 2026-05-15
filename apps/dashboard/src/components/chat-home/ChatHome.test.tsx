// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import ChatHome from "./ChatHome";

const routeTask = vi.fn();
vi.mock("@/lib/studio/route-task-action", () => ({
  routeTask: (...a: unknown[]) => routeTask(...a),
}));

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const defaultProps = {
  role: "member" as const,
  hasProviderKey: true,
  recentRuns: [
    { id: "r1", template_id: "legal:nda", task: "earlier task", status: "complete", created_at: "2026-05-13T00:00:00Z" },
    { id: "r2", template_id: "marketing:custom", task: "another", status: "complete", created_at: "2026-05-12T00:00:00Z" },
  ],
};

beforeEach(() => {
  routeTask.mockReset();
  push.mockReset();
});
afterEach(cleanup);

describe("ChatHome state machine", () => {
  it("starts in idle with submit disabled (empty task)", () => {
    render(<ChatHome {...defaultProps} />);
    expect(screen.getByRole("button", { name: /ask bbc/i })).toHaveProperty("disabled", true);
  });

  it("enables submit once task meets min length", () => {
    render(<ChatHome {...defaultProps} />);
    fireEvent.change(screen.getByRole("textbox", { name: /describe/i }), {
      target: { value: "write an NDA for a contractor" },
    });
    expect(screen.getByRole("button", { name: /ask bbc/i })).toHaveProperty("disabled", false);
  });

  it("renders candidates when routeTask returns kind=candidates", async () => {
    routeTask.mockResolvedValue({
      ok: true,
      kind: "candidates",
      candidates: [
        { templateId: "legal:nda", owningRole: "legal", label: "NDA", rationale: "for contractors" },
      ],
    });
    render(<ChatHome {...defaultProps} />);
    fireEvent.change(screen.getByRole("textbox", { name: /describe/i }), {
      target: { value: "write an NDA for a contractor" },
    });
    fireEvent.click(screen.getByRole("button", { name: /ask bbc/i }));
    await waitFor(() => expect(screen.getByText("NDA")).toBeTruthy());
    expect(screen.getByText("for contractors")).toBeTruthy();
  });

  it("renders clarify when routeTask returns kind=clarify", async () => {
    routeTask.mockResolvedValue({
      ok: true,
      kind: "clarify",
      question: "Which department is this for?",
      suggestions: ["Sales", "Support", "Engineering"],
    });
    render(<ChatHome {...defaultProps} />);
    fireEvent.change(screen.getByRole("textbox", { name: /describe/i }), {
      target: { value: "draft a follow-up" },
    });
    fireEvent.click(screen.getByRole("button", { name: /ask bbc/i }));
    await waitFor(() => expect(screen.getByText("Which department is this for?")).toBeTruthy());
    expect(screen.getByRole("button", { name: /^answer: Sales$/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^answer: Support$/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^answer: Engineering$/ })).toBeTruthy();
  });

  it("max 1 clarify turn: clicking a suggestion re-calls routeTask with the clarification and renders candidates", async () => {
    routeTask
      .mockResolvedValueOnce({ ok: true, kind: "clarify", question: "Which dept?", suggestions: ["Sales", "Support"] })
      .mockResolvedValueOnce({
        ok: true,
        kind: "candidates",
        candidates: [{ templateId: "support:reply", owningRole: "support", label: "Reply", rationale: "ok" }],
      });
    render(<ChatHome {...defaultProps} />);
    fireEvent.change(screen.getByRole("textbox", { name: /describe/i }), {
      target: { value: "draft a follow-up" },
    });
    fireEvent.click(screen.getByRole("button", { name: /ask bbc/i }));
    await waitFor(() => screen.getByText("Which dept?"));
    fireEvent.click(screen.getByRole("button", { name: /^answer: Sales$/ }));
    await waitFor(() =>
      expect(routeTask).toHaveBeenNthCalledWith(2, "draft a follow-up", { clarification: "Sales" }),
    );
    await waitFor(() => expect(screen.getByText("Reply")).toBeTruthy());
  });

  it("never renders a second clarify even if the server tries to send one", async () => {
    routeTask
      .mockResolvedValueOnce({ ok: true, kind: "clarify", question: "Q1?", suggestions: ["a", "b"] })
      .mockResolvedValueOnce({ ok: true, kind: "clarify", question: "Q2?", suggestions: ["c", "d"] });
    render(<ChatHome {...defaultProps} />);
    fireEvent.change(screen.getByRole("textbox", { name: /describe/i }), {
      target: { value: "ambiguous task here" },
    });
    fireEvent.click(screen.getByRole("button", { name: /ask bbc/i }));
    await waitFor(() => screen.getByText("Q1?"));
    fireEvent.click(screen.getByRole("button", { name: /^answer: a$/ }));
    await waitFor(() => {
      expect(screen.queryByText("Q2?")).toBeNull();
    });
  });

  it("shows error inline on routeTask failure", async () => {
    routeTask.mockResolvedValue({ ok: false, error: "service unavailable" });
    render(<ChatHome {...defaultProps} />);
    fireEvent.change(screen.getByRole("textbox", { name: /describe/i }), {
      target: { value: "anything substantive" },
    });
    fireEvent.click(screen.getByRole("button", { name: /ask bbc/i }));
    await waitFor(() => expect(screen.getByText(/service unavailable/i)).toBeTruthy());
  });

  it("clicking a candidate navigates to /studio/<role> with template and task", async () => {
    routeTask.mockResolvedValue({
      ok: true,
      kind: "candidates",
      candidates: [{ templateId: "legal:nda", owningRole: "legal", label: "NDA", rationale: "fits" }],
    });
    render(<ChatHome {...defaultProps} />);
    const taskText = "write an NDA for a contractor";
    fireEvent.change(screen.getByRole("textbox", { name: /describe/i }), { target: { value: taskText } });
    fireEvent.click(screen.getByRole("button", { name: /ask bbc/i }));
    await waitFor(() => screen.getByText("NDA"));
    fireEvent.click(screen.getByRole("button", { name: /open NDA in legal studio/i }));
    expect(push).toHaveBeenCalledWith(
      `/studio/legal?template=${encodeURIComponent("legal:nda")}&task=${encodeURIComponent(taskText)}`,
    );
  });
});

describe("ChatHome — no provider key", () => {
  it("admin without provider key sees Connect a provider CTA, no input", () => {
    render(<ChatHome {...defaultProps} role="admin" hasProviderKey={false} />);
    expect(screen.getByRole("link", { name: /connect a provider/i })).toBeTruthy();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("non-admin without provider key sees Ask your admin copy", () => {
    render(<ChatHome {...defaultProps} role="member" hasProviderKey={false} />);
    expect(screen.getByText(/ask your admin/i)).toBeTruthy();
    expect(screen.queryByRole("textbox")).toBeNull();
  });
});
