// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { AppNav } from "./AppNav";

vi.mock("next/navigation", () => ({ usePathname: () => "/home" }));
vi.mock("next-themes", () => ({ useTheme: () => ({ theme: "light", setTheme: vi.fn() }) }));
vi.mock("./InboxBell", () => ({ InboxBell: () => null }));

afterEach(cleanup);

const baseProps = {
  pendingCount: 0,
  user: { label: "Alice", avatar: null, initial: "A" },
  workspace: { name: "acme", role: "admin", templateSlug: null },
};

describe("AppNav", () => {
  it("brand link points to /home", () => {
    render(<AppNav {...baseProps} />);
    const brand = screen.getByRole("link", { name: /big brain company/i });
    expect(brand.getAttribute("href")).toBe("/home");
  });

  it.each(["admin", "operator", "member"] as const)(
    "shows the same 6 primary items for %s",
    (role) => {
      render(<AppNav {...baseProps} workspace={{ ...baseProps.workspace, role }} />);
      expect(screen.getByRole("link", { name: "Home" })).toBeTruthy();
      expect(screen.getByRole("link", { name: "Gallery" })).toBeTruthy();
      expect(screen.getByRole("link", { name: "Memory" })).toBeTruthy();
      expect(screen.getByRole("link", { name: /Queue/ })).toBeTruthy();
      expect(screen.getByRole("link", { name: "Library" })).toBeTruthy();
      expect(screen.getByRole("link", { name: "Settings" })).toBeTruthy();
    },
  );

  it("shows the viewer nav subset (no Queue, no Settings)", () => {
    render(<AppNav {...baseProps} workspace={{ ...baseProps.workspace, role: "viewer" }} />);
    expect(screen.getByRole("link", { name: "Home" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Gallery" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Memory" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Library" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: /Queue/ })).toBeNull();
    expect(screen.queryByRole("link", { name: "Settings" })).toBeNull();
  });

  it("admin sees Dashboard link in avatar menu", () => {
    render(<AppNav {...baseProps} />);
    fireEvent.click(screen.getByRole("button", { expanded: false, name: "A" }));
    expect(screen.getByRole("menuitem", { name: /Dashboard/ })).toBeTruthy();
  });

  it("non-admin does not see Dashboard in avatar menu", () => {
    render(<AppNav {...baseProps} workspace={{ ...baseProps.workspace, role: "operator" }} />);
    fireEvent.click(screen.getByRole("button", { expanded: false, name: "A" }));
    expect(screen.queryByRole("menuitem", { name: /Dashboard/ })).toBeNull();
  });
});
