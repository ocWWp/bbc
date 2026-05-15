// @vitest-environment jsdom
//
// Phase P Step 2 (Task 17) flattened the per-role nav. Pre-Step-2 nav drifted
// by acting role: admin saw 6 items, operator 5 (no Home), member a
// /studio-shaped subset with Brain + Inbox.
//
// Post-Step-2 contract:
//   admin / operator / member  -> Home, Gallery, Memory, Queue, Library
//   viewer                     -> Home, Gallery, Memory, Library  (read-only)
//
// Settings moved into the avatar dropdown (account-level, not a primary route).
// /brain is reached via the root redirect for viewers, not the nav; the inbox
// lives next to the avatar bell.
//
// This is UI chrome, not authorization — RLS at the SQL layer (ADR-0012,
// migration 0042) is the real gate. Nav hiding is the visible part.

import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, within, cleanup } from "@testing-library/react";

afterEach(cleanup);

vi.mock("next/navigation", () => ({
  usePathname: () => "/queue",
}));

vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: "light", setTheme: vi.fn() }),
}));

import { AppNav } from "@/components/AppNav";

const noUser = null;
const baseUser = { label: "alice", avatar: null, initial: "A" };

function workspace(role: string, templateSlug: string | null) {
  return { name: "acme", role, templateSlug };
}

function getNav() {
  return screen.getByRole("navigation", { name: /primary/i });
}

const PRIMARY = ["Home", "Gallery", "Memory", "Queue", "Library"] as const;

describe("AppNav — role-aware route visibility", () => {
  it.each(["admin", "operator", "member"] as const)(
    "%s sees the full 5-item primary nav",
    (role) => {
      render(
        <AppNav
          pendingCount={0}
          user={baseUser}
          workspace={workspace(role, "marketing")}
        />,
      );
      const nav = getNav();
      for (const label of PRIMARY) {
        expect(within(nav).getByText(label)).toBeDefined();
      }
      expect(within(nav).queryByText("Settings")).toBeNull();
      expect(within(nav).queryByText("Brain")).toBeNull();
      expect(within(nav).queryByText("Inbox")).toBeNull();
      expect(within(nav).queryByText("Studio")).toBeNull();
    },
  );

  it("viewer sees the read-only subset (no Queue, no Settings)", () => {
    render(
      <AppNav
        pendingCount={0}
        user={baseUser}
        workspace={workspace("viewer", null)}
      />,
    );
    const nav = getNav();
    expect(within(nav).getByText("Home")).toBeDefined();
    expect(within(nav).getByText("Gallery")).toBeDefined();
    expect(within(nav).getByText("Memory")).toBeDefined();
    expect(within(nav).getByText("Library")).toBeDefined();
    expect(within(nav).queryByText("Queue")).toBeNull();
    expect(within(nav).queryByText("Settings")).toBeNull();
    expect(within(nav).queryByText("Brain")).toBeNull();
  });

  it("unauth (no workspace) falls back to the primary nav so signin flow works", () => {
    // When workspace is null, AppNav has no role to switch on; we fall back
    // to the full primary list. Real unauth users get redirected by middleware
    // before clicking, so this is a safety default.
    render(<AppNav pendingCount={0} user={noUser} workspace={null} />);
    const nav = getNav();
    for (const label of PRIMARY) {
      expect(within(nav).getByText(label)).toBeDefined();
    }
  });

  it("Queue badge shows when pendingCount > 0", () => {
    render(
      <AppNav
        pendingCount={3}
        user={baseUser}
        workspace={workspace("admin", "marketing")}
      />,
    );
    expect(screen.getByText("3")).toBeDefined();
  });
});
