// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import BrainResults from "./BrainResults";
import type { BrainHit } from "@/lib/home/search-brain-action";

afterEach(cleanup);

function mkHit(id: string, partial: Partial<BrainHit> = {}): BrainHit {
  return {
    id,
    type: "decision",
    title: `Hit ${id}`,
    updated_at: "2026-05-15T00:00:00Z",
    ...partial,
  };
}

describe("BrainResults", () => {
  it("renders an empty state with an 'open brain' link when no hits", () => {
    render(<BrainResults query="company doing" hits={[]} onReset={vi.fn()} />);
    expect(screen.getByText(/didn't find anything/i)).toBeTruthy();
    const link = screen.getByRole("link", { name: /open brain/i });
    expect(link.getAttribute("href")).toBe("/brain");
  });

  it("does NOT synthesize text into the empty state for the user's query (no LLM, just echo)", () => {
    render(<BrainResults query="how are we doing" hits={[]} onReset={vi.fn()} />);
    // The query is echoed; nothing is generated about the company. This is
    // the Phase P contract — no fluent synthesis, just facts.
    expect(screen.getByText(/no matches for/i).textContent).toContain("how are we doing");
  });

  it("renders one row per hit linking to /brain/[id]", () => {
    const hits = [mkHit("a"), mkHit("b", { type: "vendor", title: "Stripe" })];
    render(<BrainResults query="x" hits={hits} onReset={vi.fn()} />);
    expect(screen.getByText("Hit a")).toBeTruthy();
    expect(screen.getByText("Stripe")).toBeTruthy();
    const links = screen.getAllByRole("link");
    expect(links.find((l) => l.getAttribute("href") === "/brain/a")).toBeTruthy();
    expect(links.find((l) => l.getAttribute("href") === "/brain/b")).toBeTruthy();
  });

  it("calls onReset when the 'new search' link is clicked", () => {
    const reset = vi.fn();
    render(<BrainResults query="x" hits={[mkHit("a")]} onReset={reset} />);
    fireEvent.click(screen.getByRole("button", { name: /new search/i }));
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it("falls back to 'memory' type label when a hit has null type", () => {
    render(<BrainResults query="x" hits={[mkHit("a", { type: null })]} onReset={vi.fn()} />);
    expect(screen.getAllByText("memory").length).toBeGreaterThan(0);
  });
});
