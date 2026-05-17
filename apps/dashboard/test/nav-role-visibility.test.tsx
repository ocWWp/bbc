// @vitest-environment jsdom
//
// Task 13 of v1.5 launch polish. AppNav renders different route lists
// per role:
//   admin     -> Home, Studio, Memory, Ops, Library, Settings
//   operator  -> Studio, Memory, Ops, Library, Settings  (same minus Home)
//   member    -> Studio (/studio/<slug>), Brain, Inbox      (3 routes only)
//
// This is UI chrome, not authorization — RLS at the SQL layer (ADR-0012,
// migration 0042) is the real gate. Nav hiding is the visible part.

import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, within, cleanup } from "@testing-library/react";

afterEach(cleanup);

vi.mock("next/navigation", () => ({
  usePathname: () => "/ops",
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

describe("AppNav — role-aware route visibility", () => {
  it("admin sees Home + Studio + Memory + Ops + Library + Settings", () => {
    render(
      <AppNav
        pendingCount={0}
        user={baseUser}
        workspace={workspace("admin", "marketing")}
      />,
    );
    const nav = getNav();
    expect(within(nav).getByText("Home")).toBeDefined();
    expect(within(nav).getByText("Studio")).toBeDefined();
    expect(within(nav).getByText("Memory")).toBeDefined();
    expect(within(nav).getByText("Ops")).toBeDefined();
    expect(within(nav).getByText("Library")).toBeDefined();
    expect(within(nav).getByText("Settings")).toBeDefined();
    expect(within(nav).queryByText("Brain")).toBeNull();
    expect(within(nav).queryByText("Inbox")).toBeNull();
  });

  it("operator sees admin nav minus Home", () => {
    render(
      <AppNav
        pendingCount={0}
        user={baseUser}
        workspace={workspace("operator", "marketing")}
      />,
    );
    const nav = getNav();
    expect(within(nav).queryByText("Home")).toBeNull();
    expect(within(nav).getByText("Studio")).toBeDefined();
    expect(within(nav).getByText("Memory")).toBeDefined();
    expect(within(nav).getByText("Ops")).toBeDefined();
    expect(within(nav).getByText("Library")).toBeDefined();
    expect(within(nav).getByText("Settings")).toBeDefined();
    expect(within(nav).queryByText("Brain")).toBeNull();
  });

  it("member sees only Studio + Brain + Inbox", () => {
    render(
      <AppNav
        pendingCount={0}
        user={baseUser}
        workspace={workspace("member", "engineering")}
      />,
    );
    const nav = getNav();
    expect(within(nav).getByText("Studio")).toBeDefined();
    expect(within(nav).getByText("Brain")).toBeDefined();
    expect(within(nav).getByText("Inbox")).toBeDefined();
    expect(within(nav).queryByText("Home")).toBeNull();
    expect(within(nav).queryByText("Memory")).toBeNull();
    expect(within(nav).queryByText("Ops")).toBeNull();
    expect(within(nav).queryByText("Library")).toBeNull();
    expect(within(nav).queryByText("Settings")).toBeNull();
  });

  it("member with templateSlug='engineering' points Studio at /studio/engineering", () => {
    render(
      <AppNav
        pendingCount={0}
        user={baseUser}
        workspace={workspace("member", "engineering")}
      />,
    );
    const link = screen.getByRole("link", { name: /^Studio$/ }) as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("/studio/engineering");
  });

  it("member with templateSlug=null falls back to /studio/marketing", () => {
    render(
      <AppNav
        pendingCount={0}
        user={baseUser}
        workspace={workspace("member", null)}
      />,
    );
    const link = screen.getByRole("link", { name: /^Studio$/ }) as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("/studio/marketing");
  });

  it("unauth (no workspace) still renders the legacy admin nav so signin flow works", () => {
    // When workspace is null, AppNav has no role to switch on; we fall back
    // to the admin route list. Real unauth users get redirected by middleware
    // before clicking, so this is a safety default.
    render(<AppNav pendingCount={0} user={noUser} workspace={null} />);
    const nav = getNav();
    expect(within(nav).getByText("Studio")).toBeDefined();
    expect(within(nav).getByText("Memory")).toBeDefined();
    expect(within(nav).getByText("Ops")).toBeDefined();
    expect(within(nav).getByText("Library")).toBeDefined();
  });

  it("Ops badge shows when pendingCount > 0 (admin nav)", () => {
    render(
      <AppNav
        pendingCount={3}
        user={baseUser}
        workspace={workspace("admin", "marketing")}
      />,
    );
    expect(screen.getByText("3")).toBeDefined();
  });

  it("brand link points at /home (universal back-to-home convention)", () => {
    render(
      <AppNav
        pendingCount={0}
        user={baseUser}
        workspace={workspace("admin", "marketing")}
      />,
    );
    const brand = screen.getByText("big brain company").closest("a");
    expect(brand?.getAttribute("href")).toBe("/home");
  });
});
