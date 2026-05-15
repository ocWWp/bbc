// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import RecentRunsStrip, { type RecentRun } from "./RecentRunsStrip";

afterEach(cleanup);

function mkRun(id: string, partial: Partial<RecentRun> = {}): RecentRun {
  return {
    id,
    template_id: "legal:nda",
    task: `task for ${id}`,
    status: "complete",
    created_at: "2026-05-14T00:00:00Z",
    ...partial,
  };
}

describe("RecentRunsStrip", () => {
  it("renders nothing when runs is empty", () => {
    const { container } = render(<RecentRunsStrip runs={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders the eyebrow and one row per run", () => {
    const runs = [mkRun("r1"), mkRun("r2"), mkRun("r3")];
    render(<RecentRunsStrip runs={runs} />);
    expect(screen.getByText(/recent runs/i)).toBeTruthy();
    expect(screen.getByText("task for r1")).toBeTruthy();
    expect(screen.getByText("task for r2")).toBeTruthy();
    expect(screen.getByText("task for r3")).toBeTruthy();
  });

  it("each row links to /studio/runs/<id>", () => {
    const runs = [mkRun("abc123")];
    render(<RecentRunsStrip runs={runs} />);
    const link = screen.getByRole("link");
    expect(link.getAttribute("href")).toBe("/studio/runs/abc123");
  });

  it("limits to 5 runs by default even if more provided", () => {
    const runs = Array.from({ length: 8 }, (_, i) => mkRun(`r${i}`));
    render(<RecentRunsStrip runs={runs} />);
    expect(screen.getAllByRole("link")).toHaveLength(5);
  });

  it("respects an explicit limit override", () => {
    const runs = Array.from({ length: 8 }, (_, i) => mkRun(`r${i}`));
    render(<RecentRunsStrip runs={runs} limit={3} />);
    expect(screen.getAllByRole("link")).toHaveLength(3);
  });
});
