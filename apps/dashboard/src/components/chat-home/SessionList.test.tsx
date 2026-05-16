// @vitest-environment jsdom

import { describe, expect, it, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { SessionList } from "./SessionList";
import { SessionRailContext } from "./session-rail-context";
import type { SessionRailItem } from "@/lib/home/sessions";

afterEach(() => {
  cleanup();
});

const SESSIONS: SessionRailItem[] = [
  { id: "s1", title: "First chat", last_activity_at: "2026-05-16T12:00:00.000Z" },
  { id: "s2", title: "Second chat", last_activity_at: "2026-05-16T11:00:00.000Z" },
  { id: "s3", title: "Third chat", last_activity_at: "2026-05-16T10:00:00.000Z" },
];

function renderWith(
  sessions: SessionRailItem[],
  currentSessionId: string | null,
  onDelete: (id: string) => void = vi.fn(),
) {
  return render(
    <SessionRailContext.Provider value={{ onDelete }}>
      <SessionList sessions={sessions} currentSessionId={currentSessionId} />
    </SessionRailContext.Provider>,
  );
}

describe("SessionList", () => {
  it("renders one row per session", () => {
    renderWith(SESSIONS, null);
    for (const s of SESSIONS) {
      expect(screen.getByTestId(`session-row-${s.id}`)).toBeDefined();
    }
  });

  it("marks the current session via data-current", () => {
    renderWith(SESSIONS, "s2");
    expect(screen.getByTestId("session-row-s1").getAttribute("data-current")).toBeNull();
    expect(screen.getByTestId("session-row-s2").getAttribute("data-current")).toBe("true");
    expect(screen.getByTestId("session-row-s3").getAttribute("data-current")).toBeNull();
  });

  it("renders nothing in the list when sessions is empty", () => {
    renderWith([], null);
    const list = screen.getByTestId("session-list");
    expect(list.children.length).toBe(0);
  });

  it("delete from a row fires the context onDelete with that session id", () => {
    const onDelete = vi.fn();
    renderWith(SESSIONS, null, onDelete);
    fireEvent.click(screen.getByLabelText("More actions for Second chat"));
    fireEvent.click(screen.getByTestId("session-row-delete-s2"));
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledWith("s2");
  });
});
