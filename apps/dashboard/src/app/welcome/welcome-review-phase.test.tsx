// @vitest-environment jsdom
//
// Task 24 of v1.5 launch polish. The /welcome review phase shows a tight
// supertag-grouped list of extracted proposals with: per-row drop toggle,
// top-level select-all / drop-all controls, and a single "accept N into
// brain" affordance that calls onAcceptAll with the un-dropped proposals.
//
// Note vs the plan: the existing ReviewStep groups by supertag (rather than
// rendering a flat 5-card grid). The grouped layout is denser and gives
// stronger type-affordance — kept on purpose; documented in the commit.

import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { ReviewStep } from "./_steps/review-step";
import type { ProposalWithOrigin } from "./_steps/source-types";

afterEach(cleanup);

const proposals: ProposalWithOrigin[] = [
  { type: "voice", title: "Lowercase social", fields: {}, body: "" },
  { type: "decision", title: "Use Supabase RLS", fields: {}, body: "" },
  { type: "decision", title: "AGPLv3 license", fields: {}, body: "" },
  { type: "team", title: "Sarah", fields: { role: "Product" }, body: "" },
  { type: "vendor", title: "Email vendor — Resend.com", fields: { role: "email" }, body: "" },
] as ProposalWithOrigin[];

function findAcceptButton(): HTMLButtonElement {
  return screen.getByRole("button", { name: /accept \d+ into brain/i }) as HTMLButtonElement;
}

describe("/welcome review phase — accept-all flow", () => {
  it("renders one review item per proposal", () => {
    render(<ReviewStep proposals={proposals} onAcceptAll={vi.fn()} onBack={vi.fn()} error={null} />);
    expect(screen.getByText("Lowercase social")).toBeDefined();
    expect(screen.getByText("Use Supabase RLS")).toBeDefined();
    expect(screen.getByText("AGPLv3 license")).toBeDefined();
    expect(screen.getByText("Sarah")).toBeDefined();
    expect(screen.getByText("Email vendor — Resend.com")).toBeDefined();
  });

  it("groups by supertag (one group head per distinct type)", () => {
    render(<ReviewStep proposals={proposals} onAcceptAll={vi.fn()} onBack={vi.fn()} error={null} />);
    // Two decisions, one voice, one team, one vendor → 4 distinct supertags.
    const counts = screen.getAllByText(/^[12]$/).filter((el) => el.className.includes("cnt"));
    expect(counts.length).toBe(4);
  });

  it("'accept N into brain' counts all 5 by default and calls onAcceptAll with all", async () => {
    const onAcceptAll = vi.fn().mockResolvedValue(undefined);
    render(<ReviewStep proposals={proposals} onAcceptAll={onAcceptAll} onBack={vi.fn()} error={null} />);

    expect(findAcceptButton().textContent).toMatch(/accept 5 into brain/i);
    fireEvent.click(findAcceptButton());
    expect(onAcceptAll).toHaveBeenCalledOnce();
    const passed = onAcceptAll.mock.calls[0][0] as ProposalWithOrigin[];
    expect(passed).toHaveLength(5);
  });

  it("clicking a row toggles it dropped — accept button count drops; onAcceptAll receives only kept", async () => {
    const onAcceptAll = vi.fn().mockResolvedValue(undefined);
    render(<ReviewStep proposals={proposals} onAcceptAll={onAcceptAll} onBack={vi.fn()} error={null} />);

    fireEvent.click(screen.getByText("Lowercase social"));
    expect(findAcceptButton().textContent).toMatch(/accept 4 into brain/i);

    fireEvent.click(findAcceptButton());
    expect(onAcceptAll).toHaveBeenCalledOnce();
    const passed = onAcceptAll.mock.calls[0][0] as ProposalWithOrigin[];
    expect(passed).toHaveLength(4);
    expect(passed.find((p) => p.title === "Lowercase social")).toBeUndefined();
  });

  it("'drop all' disables the accept button (selectedCount=0)", () => {
    render(<ReviewStep proposals={proposals} onAcceptAll={vi.fn()} onBack={vi.fn()} error={null} />);
    fireEvent.click(screen.getByRole("button", { name: /^drop all$/i }));
    expect(findAcceptButton().disabled).toBe(true);
    expect(findAcceptButton().textContent).toMatch(/accept 0 into brain/i);
  });

  it("'select all' restores all proposals after dropping any", () => {
    render(<ReviewStep proposals={proposals} onAcceptAll={vi.fn()} onBack={vi.fn()} error={null} />);
    fireEvent.click(screen.getByText("Lowercase social"));
    expect(findAcceptButton().textContent).toMatch(/accept 4 into brain/i);
    fireEvent.click(screen.getByRole("button", { name: /^select all$/i }));
    expect(findAcceptButton().textContent).toMatch(/accept 5 into brain/i);
  });

  it("error prop renders an inline error block", () => {
    render(
      <ReviewStep proposals={proposals} onAcceptAll={vi.fn()} onBack={vi.fn()} error="parser failed" />,
    );
    expect(screen.getByText("parser failed")).toBeDefined();
  });

  it("'edit dump' fires onBack", () => {
    const onBack = vi.fn();
    render(<ReviewStep proposals={proposals} onAcceptAll={vi.fn()} onBack={onBack} error={null} />);
    fireEvent.click(screen.getByRole("button", { name: /edit dump/i }));
    expect(onBack).toHaveBeenCalledOnce();
  });
});
