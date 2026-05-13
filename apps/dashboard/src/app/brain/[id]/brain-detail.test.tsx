// @vitest-environment jsdom
//
// Task 15 of v1.5 launch polish. /brain/[id] renders ReadOnlyMemory, which
// is the member-facing read-only view of a memory row. This test proves the
// surface is read-only — no edit input on title, no publish/archive buttons,
// no RelationPicker. The *security* of /brain/[id] is the operator+ gate on
// memory/actions.ts (covered by actions.rbac.test.ts in Task 14).

import { describe, expect, it, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import type { MemoryItemRow } from "../../memory/queries";

vi.mock("next/dynamic", () => ({
  default: () => () => null,
}));

import { ReadOnlyMemory } from "./ReadOnlyMemory";

afterEach(cleanup);

const baseItem: MemoryItemRow = {
  id: "m1",
  tenant_id: "t1",
  type: "decision",
  title: "Use Supabase RLS over a separate auth service",
  slug: "rls-over-auth-service",
  status: "active",
  fields: { rationale: "single audit surface" },
  body_blocks: [],
  path: "memory/decision/rls-over-auth-service.md",
  content: "",
  created_at: "2026-04-01T00:00:00Z",
  updated_at: "2026-04-12T00:00:00Z",
  created_by: null,
  last_modified_by: null,
} as unknown as MemoryItemRow;

const emptyRelations = { outgoing: [], incoming: [] };

describe("ReadOnlyMemory — read-only memory detail", () => {
  it("renders the title as text, not an editable input", () => {
    render(<ReadOnlyMemory item={baseItem} relations={emptyRelations} />);
    const titleEls = screen.getAllByText(baseItem.title as string);
    expect(titleEls.length).toBeGreaterThan(0);
    expect(screen.queryByRole("textbox", { name: /title/i })).toBeNull();
  });

  it("has no publish, archive, edit, save, or delete buttons", () => {
    render(<ReadOnlyMemory item={baseItem} relations={emptyRelations} />);
    expect(screen.queryByRole("button", { name: /publish/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /archive/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /^save$/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /delete/i })).toBeNull();
  });

  it("shows a 'read-only' pill in the page actions", () => {
    render(<ReadOnlyMemory item={baseItem} relations={emptyRelations} />);
    expect(screen.getByText(/read-only/i)).toBeDefined();
  });

  it("renders fields panel as static dt/dd, not a form", () => {
    render(<ReadOnlyMemory item={baseItem} relations={emptyRelations} />);
    expect(screen.getByText("rationale")).toBeDefined();
    expect(screen.getByText("single audit surface")).toBeDefined();
    expect(screen.queryAllByRole("textbox")).toHaveLength(0);
  });

  it("relation links point at /brain/<id>, not /memory/<id>", () => {
    const relations = {
      outgoing: [
        {
          id: "r1",
          kind: "supersedes" as const,
          dst: {
            id: "m2",
            type: "decision" as const,
            title: "Older decision",
            slug: "older",
          },
        },
      ],
      incoming: [
        {
          id: "r2",
          kind: "cites" as const,
          src: {
            id: "m3",
            type: "note" as const,
            title: "Citing note",
            slug: "citing",
          },
        },
      ],
    };
    render(<ReadOnlyMemory item={baseItem} relations={relations} />);
    const out = screen.getByText("Older decision").closest("a") as HTMLAnchorElement;
    expect(out.getAttribute("href")).toBe("/brain/m2");
    const inc = screen.getByText("Citing note").closest("a") as HTMLAnchorElement;
    expect(inc.getAttribute("href")).toBe("/brain/m3");
  });

  it("breadcrumb links to /brain (not /memory)", () => {
    render(<ReadOnlyMemory item={baseItem} relations={emptyRelations} />);
    const crumb = screen.getByRole("link", { name: "brain" }) as HTMLAnchorElement;
    expect(crumb.getAttribute("href")).toBe("/brain");
  });
});
