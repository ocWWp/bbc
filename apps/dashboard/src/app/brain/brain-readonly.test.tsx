// @vitest-environment jsdom
//
// Task 14 of v1.5 launch polish. /brain is the member-facing read-only view
// of /memory. This test proves the *UI surface* is read-only — no edit/delete
// buttons, no "+ new memory" affordance. The *security* gate is the
// operator-only requireRole on memory actions; that's covered in
// actions.rbac.test.ts.

import { describe, expect, it, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { BrainGrid, type BrainItem } from "./_components/BrainGrid";

afterEach(cleanup);

const sampleItems: BrainItem[] = [
  {
    id: "m1",
    type: "decision",
    title: "Use Supabase RLS over a separate auth service",
    slug: "rls-over-auth-service",
    status: "active",
    updated_at: "2026-04-12T00:00:00Z",
    fields: { rationale: "single audit surface" },
  },
  {
    id: "m2",
    type: "voice",
    title: "Lowercase in social copy",
    slug: "lowercase-social",
    status: "active",
    updated_at: "2026-04-15T00:00:00Z",
    fields: null,
  },
];

const counts = { decision: 1, voice: 1, vendor: 0, team: 0, product: 0, glossary: 0, skill: 0, source_artifact: 0, note: 0 };

describe("BrainGrid — read-only memory list", () => {
  it("renders one row per item with link to /brain/<id>", () => {
    render(<BrainGrid items={sampleItems} totalCount={2} counts={counts} />);
    const rows = screen.getAllByTestId("brain-row");
    expect(rows).toHaveLength(2);
    expect((rows[0] as HTMLAnchorElement).getAttribute("href")).toBe("/brain/m1");
    expect((rows[1] as HTMLAnchorElement).getAttribute("href")).toBe("/brain/m2");
  });

  it("has no edit, delete, archive, or new-memory affordances", () => {
    render(<BrainGrid items={sampleItems} totalCount={2} counts={counts} />);
    expect(screen.queryByRole("button", { name: /edit/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /delete/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /archive/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /\+\s*new memory/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /^new$/i })).toBeNull();
  });

  it("supertag filter chips link to ?type=<supertag>", () => {
    const { container } = render(
      <BrainGrid items={sampleItems} totalCount={2} counts={counts} />,
    );
    const chip = container.querySelector('a.px-chip[href="/brain?type=decision"]');
    expect(chip).not.toBeNull();
  });

  it("active-type chip clears back to /brain when re-clicked", () => {
    const { container } = render(
      <BrainGrid items={sampleItems} totalCount={2} counts={counts} activeType="decision" />,
    );
    // When 'decision' is active, clicking it should clear the filter — its
    // href becomes '/brain'. The 'all' chip also points at '/brain' but is
    // not marked is-on.
    const activeChip = container.querySelector("a.px-chip.is-on");
    expect(activeChip).not.toBeNull();
    expect(activeChip?.getAttribute("href")).toBe("/brain");
    expect(activeChip?.textContent).toContain("decision");
  });

  it("empty state shows 'clear' link, not a new-memory CTA", () => {
    render(<BrainGrid items={[]} totalCount={0} counts={counts} activeType="decision" />);
    expect(screen.getByText(/no rows match/i)).toBeDefined();
    expect(screen.queryByRole("link", { name: /\+\s*new memory/i })).toBeNull();
  });

  it("filter form posts to /brain (preserves read-only routing)", () => {
    const { container } = render(
      <BrainGrid items={sampleItems} totalCount={2} counts={counts} />,
    );
    const form = container.querySelector("form");
    expect(form).not.toBeNull();
    expect(form?.getAttribute("action")).toBe("/brain");
    expect(form?.getAttribute("method")).toBe("get");
  });
});
