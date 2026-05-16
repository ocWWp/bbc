// @vitest-environment jsdom

import { describe, expect, it, afterEach, vi, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";

// Mock next/navigation so we control pathname + search params from
// the test, including across re-renders for the auto-close behavior.
let mockPathname = "/home";
const mockSearchGet = vi.fn<(key: string) => string | null>(() => null);

vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
  useSearchParams: () => ({ get: mockSearchGet }),
}));

import { SessionRailShell } from "./SessionRailShell";
import { useSessionRailContext } from "./session-rail-context";

beforeEach(() => {
  mockPathname = "/home";
  mockSearchGet.mockReset();
  mockSearchGet.mockImplementation(() => null);
});

afterEach(() => {
  cleanup();
});

function Rail() {
  return <div data-testid="rail-content">rail</div>;
}

function Consumer() {
  // Touch the context so the test can verify it's provided.
  const { onDelete } = useSessionRailContext();
  return (
    <button
      type="button"
      data-testid="consumer-delete"
      onClick={() => onDelete("abc")}
    >
      delete
    </button>
  );
}

describe("SessionRailShell", () => {
  it("renders both the rail slot and the children body", () => {
    render(
      <SessionRailShell rail={<Rail />} onDelete={vi.fn()}>
        <div data-testid="chat-body">chat</div>
      </SessionRailShell>,
    );
    // Rail is rendered (twice in theory once mobile is open, but at
    // initial render the drawer is closed → only desktop rail mounts).
    expect(screen.getAllByTestId("rail-content").length).toBeGreaterThan(0);
    expect(screen.getByTestId("chat-body")).toBeDefined();
  });

  it("opens the drawer when the toggle is clicked", () => {
    render(
      <SessionRailShell rail={<Rail />} onDelete={vi.fn()}>
        <div>chat</div>
      </SessionRailShell>,
    );
    expect(screen.queryByTestId("session-rail-drawer")).toBeNull();
    fireEvent.click(screen.getByTestId("session-rail-toggle"));
    expect(screen.getByTestId("session-rail-drawer")).toBeDefined();
    expect(screen.getByTestId("session-rail-scrim")).toBeDefined();
  });

  it("closes the drawer when the scrim is clicked", () => {
    render(
      <SessionRailShell rail={<Rail />} onDelete={vi.fn()}>
        <div>chat</div>
      </SessionRailShell>,
    );
    fireEvent.click(screen.getByTestId("session-rail-toggle"));
    expect(screen.getByTestId("session-rail-drawer")).toBeDefined();
    fireEvent.click(screen.getByTestId("session-rail-scrim"));
    // Exit animation aside, the scrim/drawer are queued for removal —
    // verify the toggle's aria-expanded flips back.
    expect(
      screen.getByTestId("session-rail-toggle").getAttribute("aria-expanded"),
    ).toBe("false");
  });

  it("provides onDelete to descendants via SessionRailContext", () => {
    const onDelete = vi.fn();
    render(
      <SessionRailShell rail={<Rail />} onDelete={onDelete}>
        <Consumer />
      </SessionRailShell>,
    );
    fireEvent.click(screen.getByTestId("consumer-delete"));
    expect(onDelete).toHaveBeenCalledWith("abc");
  });

  it("closes drawer on Escape key", () => {
    render(
      <SessionRailShell rail={<Rail />} onDelete={vi.fn()}>
        <div>chat</div>
      </SessionRailShell>,
    );
    fireEvent.click(screen.getByTestId("session-rail-toggle"));
    expect(screen.getByTestId("session-rail-drawer")).toBeDefined();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(
      screen.getByTestId("session-rail-toggle").getAttribute("aria-expanded"),
    ).toBe("false");
  });

  it("auto-closes the drawer when ?session= changes", () => {
    const { rerender } = render(
      <SessionRailShell rail={<Rail />} onDelete={vi.fn()}>
        <div>chat</div>
      </SessionRailShell>,
    );
    fireEvent.click(screen.getByTestId("session-rail-toggle"));
    expect(screen.getByTestId("session-rail-drawer")).toBeDefined();

    // Simulate ?session=abc landing on the page.
    act(() => {
      mockSearchGet.mockImplementation((k: string) =>
        k === "session" ? "abc" : null,
      );
    });
    rerender(
      <SessionRailShell rail={<Rail />} onDelete={vi.fn()}>
        <div>chat</div>
      </SessionRailShell>,
    );
    expect(
      screen.getByTestId("session-rail-toggle").getAttribute("aria-expanded"),
    ).toBe("false");
  });
});
