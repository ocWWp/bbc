// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import ChatHome from "./ChatHome";

const routeTask = vi.fn();
vi.mock("@/lib/studio/route-task-action", () => ({
  routeTask: (...a: unknown[]) => routeTask(...a),
}));

const searchBrain = vi.fn();
vi.mock("@/lib/home/search-brain-action", () => ({
  searchBrain: (...a: unknown[]) => searchBrain(...a),
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
  searchBrain.mockReset();
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
  it("admin without provider key sees Connect a provider CTA pointing at /settings/keys (Anthropic UI), no input", () => {
    render(<ChatHome {...defaultProps} role="admin" hasProviderKey={false} />);
    const cta = screen.getByRole("link", { name: /connect a provider/i });
    expect(cta.getAttribute("href")).toBe("/settings/keys");
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("non-admin without provider key sees Ask your admin copy", () => {
    render(<ChatHome {...defaultProps} role="member" hasProviderKey={false} />);
    expect(screen.getByText(/ask your admin/i)).toBeTruthy();
    expect(screen.queryByRole("textbox")).toBeNull();
  });
});

describe("ChatHome — codex review fixes", () => {
  it("hasClarified resets per task — second task with first-time clarify is not blocked", async () => {
    // First task: clarify → answer → candidates (hasClarified becomes true)
    routeTask
      .mockResolvedValueOnce({ ok: true, kind: "clarify", question: "Q1?", suggestions: ["a", "b"] })
      .mockResolvedValueOnce({
        ok: true,
        kind: "candidates",
        candidates: [{ templateId: "support:reply", owningRole: "support", label: "Reply", rationale: "ok" }],
      })
      // Second task (fresh): server returns clarify on first turn — must NOT be blocked
      .mockResolvedValueOnce({ ok: true, kind: "clarify", question: "Q2-FRESH?", suggestions: ["x", "y"] });

    render(<ChatHome {...defaultProps} />);

    // First cycle: clarify → answer → candidates.
    fireEvent.change(screen.getByRole("textbox", { name: /describe/i }), {
      target: { value: "first ambiguous task" },
    });
    fireEvent.click(screen.getByRole("button", { name: /ask bbc/i }));
    await waitFor(() => screen.getByText("Q1?"));
    fireEvent.click(screen.getByRole("button", { name: /^answer: a$/ }));
    await waitFor(() => screen.getByText("Reply"));

    // Second task (re-query after the clarify-stage remount). Clarify should
    // render, NOT the "couldn't narrow this down" error — that error is what
    // the prior approach produced because hasClarified leaked across tasks.
    fireEvent.change(screen.getByRole("textbox", { name: /describe/i }), {
      target: { value: "second different task" },
    });
    fireEvent.click(screen.getByRole("button", { name: /ask bbc/i }));
    await waitFor(() => expect(screen.getByText("Q2-FRESH?")).toBeTruthy());
    expect(screen.queryByText(/couldn't narrow this down/i)).toBeNull();
  });

  it("starter pick resets hasClarified so the starter can receive a fresh clarify", async () => {
    routeTask
      .mockResolvedValueOnce({ ok: true, kind: "clarify", question: "Q1?", suggestions: ["a"] })
      .mockResolvedValueOnce({ ok: true, kind: "candidates", candidates: [
        { templateId: "x", owningRole: "support", label: "X", rationale: "ok" },
      ]})
      .mockResolvedValueOnce({ ok: true, kind: "clarify", question: "Q-STARTER?", suggestions: ["yes", "no"] });

    render(<ChatHome {...defaultProps} />);
    const input = screen.getByRole("textbox", { name: /describe/i });
    fireEvent.change(input, { target: { value: "first task" } });
    fireEvent.click(screen.getByRole("button", { name: /ask bbc/i }));
    await waitFor(() => screen.getByText("Q1?"));
    fireEvent.click(screen.getByRole("button", { name: /^answer: a$/ }));
    await waitFor(() => screen.getByText("X"));

    // Picking a starter populates the input AND resets the guard.
    fireEvent.click(screen.getByRole("button", { name: "Draft an NDA" }));
    fireEvent.click(screen.getByRole("button", { name: /ask bbc/i }));
    await waitFor(() => expect(screen.getByText("Q-STARTER?")).toBeTruthy());
  });

  it("clarification is carried into the studio deep link as part of ?task=", async () => {
    routeTask
      .mockResolvedValueOnce({ ok: true, kind: "clarify", question: "Which dept?", suggestions: ["Sales"] })
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
    await waitFor(() => screen.getByText("Reply"));

    fireEvent.click(screen.getByRole("button", { name: /open Reply in support studio/i }));
    expect(push).toHaveBeenCalledWith(expect.stringContaining(
      encodeURIComponent("draft a follow-up — Sales"),
    ));
  });

  it("non-clarify candidates carry the task plain (no clarification appended)", async () => {
    routeTask.mockResolvedValue({
      ok: true,
      kind: "candidates",
      candidates: [{ templateId: "legal:nda", owningRole: "legal", label: "NDA-plain", rationale: "fits" }],
    });
    render(<ChatHome {...defaultProps} />);
    fireEvent.change(screen.getByRole("textbox", { name: /describe/i }), {
      target: { value: "write an NDA for a contractor" },
    });
    fireEvent.click(screen.getByRole("button", { name: /ask bbc/i }));
    await waitFor(() => screen.getByText("NDA-plain"));
    fireEvent.click(screen.getByRole("button", { name: /open NDA-plain in legal studio/i }));
    const calledWith = push.mock.calls[0]?.[0] as string;
    expect(calledWith).toContain(encodeURIComponent("write an NDA for a contractor"));
    expect(calledWith).not.toContain("%E2%80%94"); // em dash not present (no clarification appended)
  });
});

describe("ChatHome — Read vs Make intent toggle (Option D)", () => {
  it("defaults to Make draft intent: submit calls routeTask, never searchBrain", async () => {
    routeTask.mockResolvedValue({
      ok: true,
      kind: "candidates",
      candidates: [{ templateId: "legal:nda", owningRole: "legal", label: "NDA", rationale: "fits" }],
    });
    render(<ChatHome {...defaultProps} />);
    // Make draft tab is on by default.
    const makeTab = screen.getByRole("tab", { name: /make draft/i });
    expect(makeTab.getAttribute("aria-selected")).toBe("true");

    fireEvent.change(screen.getByRole("textbox", { name: /describe/i }), {
      target: { value: "write an NDA for a contractor" },
    });
    fireEvent.click(screen.getByRole("button", { name: /ask bbc/i }));
    await waitFor(() => expect(routeTask).toHaveBeenCalledTimes(1));
    expect(searchBrain).not.toHaveBeenCalled();
  });

  it("switching to Ask brain re-labels the submit and routes through searchBrain (not routeTask)", async () => {
    searchBrain.mockResolvedValue({
      ok: true,
      hits: [
        { id: "m1", type: "decision", title: "Q3 metrics targets", updated_at: "2026-04-12T00:00:00Z" },
      ],
    });
    render(<ChatHome {...defaultProps} />);
    fireEvent.click(screen.getByRole("tab", { name: /ask brain/i }));

    // Submit pill should now say "Search brain", and the textbox accessible
    // name should reflect the intent.
    expect(screen.getByRole("button", { name: /search brain/i })).toBeTruthy();
    const input = screen.getByRole("textbox", { name: /search your brain/i });
    fireEvent.change(input, { target: { value: "Q3 metrics" } });
    fireEvent.click(screen.getByRole("button", { name: /search brain/i }));

    await waitFor(() => expect(searchBrain).toHaveBeenCalledWith("Q3 metrics"));
    expect(routeTask).not.toHaveBeenCalled();
  });

  it("Ask brain with hits renders BrainResults; clicking a hit deep-links to /brain/[id]", async () => {
    searchBrain.mockResolvedValue({
      ok: true,
      hits: [
        { id: "mem-abc", type: "decision", title: "Q3 metrics targets", updated_at: "2026-04-12T00:00:00Z" },
        { id: "mem-def", type: "glossary", title: "runway", updated_at: "2026-05-10T00:00:00Z" },
      ],
    });
    render(<ChatHome {...defaultProps} />);
    fireEvent.click(screen.getByRole("tab", { name: /ask brain/i }));
    fireEvent.change(screen.getByRole("textbox", { name: /search your brain/i }), {
      target: { value: "Q3 metrics" },
    });
    fireEvent.click(screen.getByRole("button", { name: /search brain/i }));

    await waitFor(() => expect(screen.getByText("Q3 metrics targets")).toBeTruthy());
    expect(screen.getByText("runway")).toBeTruthy();
    expect(screen.getByText(/2 matches in your brain/i)).toBeTruthy();

    const link = screen.getByText("Q3 metrics targets").closest("a");
    expect(link?.getAttribute("href")).toBe("/brain/mem-abc");
  });

  it("Ask brain with 0 hits renders empty state echoing the query (no synthesis)", async () => {
    searchBrain.mockResolvedValue({ ok: true, hits: [] });
    render(<ChatHome {...defaultProps} />);
    fireEvent.click(screen.getByRole("tab", { name: /ask brain/i }));
    fireEvent.change(screen.getByRole("textbox", { name: /search your brain/i }), {
      target: { value: "how is the company doing rn" },
    });
    fireEvent.click(screen.getByRole("button", { name: /search brain/i }));

    await waitFor(() => expect(screen.getByText(/no matches for/i)).toBeTruthy());
    // The query is echoed; nothing is generated about the company.
    expect(screen.getByText(/no matches for/i).textContent).toContain("how is the company doing rn");
    expect(screen.getByRole("link", { name: /open brain/i })).toBeTruthy();
  });

  it("Ask brain failure renders the error stage with the server message", async () => {
    searchBrain.mockResolvedValue({ ok: false, error: "Too many searches. Wait a minute and try again." });
    render(<ChatHome {...defaultProps} />);
    fireEvent.click(screen.getByRole("tab", { name: /ask brain/i }));
    fireEvent.change(screen.getByRole("textbox", { name: /search your brain/i }), {
      target: { value: "anything substantive" },
    });
    fireEvent.click(screen.getByRole("button", { name: /search brain/i }));
    await waitFor(() => expect(screen.getByText(/too many searches/i)).toBeTruthy());
  });

  it("clicking 'new search' from brain results returns to the composer (idle stage)", async () => {
    searchBrain.mockResolvedValue({
      ok: true,
      hits: [{ id: "m1", type: "decision", title: "Q3 metrics targets", updated_at: "2026-04-12T00:00:00Z" }],
    });
    render(<ChatHome {...defaultProps} />);
    fireEvent.click(screen.getByRole("tab", { name: /ask brain/i }));
    fireEvent.change(screen.getByRole("textbox", { name: /search your brain/i }), {
      target: { value: "Q3 metrics" },
    });
    fireEvent.click(screen.getByRole("button", { name: /search brain/i }));
    await waitFor(() => screen.getByText("Q3 metrics targets"));

    fireEvent.click(screen.getByRole("button", { name: /new search/i }));
    // Composer should be visible again with the search-brain label still on.
    expect(screen.getByRole("textbox", { name: /search your brain/i })).toBeTruthy();
    expect(screen.queryByText("Q3 metrics targets")).toBeNull();
  });

  it("switching intent from ask back to make resets the stage and re-labels the submit", async () => {
    searchBrain.mockResolvedValue({
      ok: true,
      hits: [{ id: "m1", type: "decision", title: "Q3 metrics targets", updated_at: "2026-04-12T00:00:00Z" }],
    });
    render(<ChatHome {...defaultProps} />);
    fireEvent.click(screen.getByRole("tab", { name: /ask brain/i }));
    fireEvent.change(screen.getByRole("textbox", { name: /search your brain/i }), {
      target: { value: "Q3 metrics" },
    });
    fireEvent.click(screen.getByRole("button", { name: /search brain/i }));
    await waitFor(() => screen.getByText("Q3 metrics targets"));

    // Flip back to Make draft — the brain hits must clear so they don't
    // contaminate the routing surface.
    fireEvent.click(screen.getByRole("tab", { name: /make draft/i }));
    expect(screen.queryByText("Q3 metrics targets")).toBeNull();
    expect(screen.getByRole("button", { name: /ask bbc/i })).toBeTruthy();
  });
});
