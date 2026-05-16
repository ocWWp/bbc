// @vitest-environment jsdom

import { describe, expect, it, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { SessionRow } from "./SessionRow";

afterEach(() => {
  cleanup();
});

const SESSION = {
  id: "sess-abc",
  title: "Voice + tone decisions",
  last_activity_at: "2026-05-16T10:00:00.000Z",
};

function renderRow(overrides: Partial<React.ComponentProps<typeof SessionRow>> = {}) {
  const onDelete = vi.fn();
  const utils = render(
    <SessionRow
      session={SESSION}
      isCurrent={false}
      onDelete={onDelete}
      {...overrides}
    />,
  );
  return { onDelete, ...utils };
}

describe("SessionRow", () => {
  it("renders the title", () => {
    renderRow();
    expect(screen.getByText(SESSION.title)).toBeDefined();
  });

  it("links to /home?session=<id>", () => {
    renderRow();
    const link = screen.getByText(SESSION.title).closest("a");
    expect(link).not.toBeNull();
    expect(link!.getAttribute("href")).toBe(`/home?session=${SESSION.id}`);
  });

  it("renders the kebab button with the right aria-label", () => {
    renderRow();
    const kebab = screen.getByLabelText(`More actions for ${SESSION.title}`);
    expect(kebab).toBeDefined();
  });

  it("clicking the kebab opens the popover with Delete + Cancel", () => {
    renderRow();
    const kebab = screen.getByLabelText(`More actions for ${SESSION.title}`);
    fireEvent.click(kebab);
    expect(screen.getByRole("menu")).toBeDefined();
    expect(screen.getByTestId(`session-row-delete-${SESSION.id}`)).toBeDefined();
    expect(screen.getByTestId(`session-row-cancel-${SESSION.id}`)).toBeDefined();
  });

  it("clicking Delete fires onDelete with the session id and closes the popover", () => {
    const { onDelete } = renderRow();
    fireEvent.click(screen.getByLabelText(`More actions for ${SESSION.title}`));
    fireEvent.click(screen.getByTestId(`session-row-delete-${SESSION.id}`));
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledWith(SESSION.id);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("clicking Cancel closes the popover without firing onDelete", () => {
    const { onDelete } = renderRow();
    fireEvent.click(screen.getByLabelText(`More actions for ${SESSION.title}`));
    fireEvent.click(screen.getByTestId(`session-row-cancel-${SESSION.id}`));
    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("clicking outside the row closes the popover", () => {
    renderRow();
    fireEvent.click(screen.getByLabelText(`More actions for ${SESSION.title}`));
    expect(screen.getByRole("menu")).toBeDefined();
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("Escape key closes the popover", () => {
    renderRow();
    fireEvent.click(screen.getByLabelText(`More actions for ${SESSION.title}`));
    const menu = screen.getByRole("menu");
    fireEvent.keyDown(menu, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("marks the row data-current when isCurrent is true", () => {
    renderRow({ isCurrent: true });
    const row = screen.getByTestId(`session-row-${SESSION.id}`);
    expect(row.getAttribute("data-current")).toBe("true");
  });

  it("does not mark the row data-current when isCurrent is false", () => {
    renderRow({ isCurrent: false });
    const row = screen.getByTestId(`session-row-${SESSION.id}`);
    expect(row.getAttribute("data-current")).toBeNull();
  });
});
