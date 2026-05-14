// @vitest-environment jsdom
//
// Task 23 of v1.5 launch polish. The /welcome dump phase is one focused
// task: paste + optional URL/file sources. No role picker, no skill grid,
// no Loop-3 preview card. Headline names the empty brain.

import { describe, expect, it, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/welcome",
}));

// BrainView pulls in d3 + ResizeObserver — jsdom lacks the latter and we
// don't need the canvas-y preview to test the dump phase contract.
vi.mock("@/components/memory/BrainView", () => ({
  BrainView: () => null,
}));

import { DumpStep } from "./_steps/dump-step";

afterEach(cleanup);

const baseProps = {
  value: "",
  onChange: () => {},
  onSubmit: () => {},
  error: null,
  sources: [],
  onAddUrl: async () => ({ ok: true } as const),
  onAddFile: async () => ({ ok: true } as const),
  onRemoveSource: () => {},
};

describe("/welcome dump phase — single paste-or-import task", () => {
  it("headline reads '<tenant>'s brain is empty.' when tenantSlug is provided", () => {
    render(<DumpStep {...baseProps} tenantSlug="acme" />);
    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading.textContent).toMatch(/^acme'?s brain is empty\.?$/i);
  });

  it("falls back to 'your brain is empty.' when no tenantSlug is provided", () => {
    render(<DumpStep {...baseProps} />);
    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading.textContent).toMatch(/^your brain is empty\.?$/i);
  });

  it("renders exactly one paste textarea in default paste mode", () => {
    render(<DumpStep {...baseProps} tenantSlug="acme" />);
    const textareas = screen.getAllByRole("textbox");
    // One textarea (paste). URL/file modes are mutually exclusive and
    // toggled; they don't render simultaneously.
    expect(textareas.length).toBe(1);
  });

  it("renders the three input-mode buttons (paste / drop a file / paste a url)", () => {
    render(<DumpStep {...baseProps} tenantSlug="acme" />);
    // Use exact name match for the bare "paste" button so it doesn't also
    // match "paste a url". ⌘V is inside the same button — match on text.
    const pasteBtns = screen.getAllByRole("button").filter((b) => /^paste\s*⌘V$/i.test(b.textContent ?? ""));
    expect(pasteBtns).toHaveLength(1);
    expect(screen.getByRole("button", { name: /drop a file/i })).toBeDefined();
    expect(screen.getByRole("button", { name: /paste a url/i })).toBeDefined();
  });

  it("has no role picker, no skill grid, no Loop-3 preview card", () => {
    render(<DumpStep {...baseProps} tenantSlug="acme" />);
    expect(screen.queryByText(/pick your role/i)).toBeNull();
    expect(screen.queryByText(/role picker/i)).toBeNull();
    expect(screen.queryByText(/install skills/i)).toBeNull();
    expect(screen.queryByText(/skill grid/i)).toBeNull();
    expect(screen.queryByText(/loop ?3/i)).toBeNull();
  });
});
