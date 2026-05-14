// @vitest-environment jsdom

import { describe, expect, it, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { InboxBell } from "./InboxBell";
import type { InboxItem } from "@/lib/inbox/read-inbox";

afterEach(cleanup);

function mk(id: string, partial: Partial<InboxItem> = {}): InboxItem {
  return {
    id,
    channel: "from_bbc",
    kind: "flag_resolved",
    title: `Item ${id}`,
    body: null,
    source_kind: null,
    source_queue_item_id: null,
    source_recommendation_id: null,
    source_memory_id: null,
    flagger_user_id: null,
    read_at: null,
    created_at: new Date(Date.now() - 5 * 60_000).toISOString(),
    ...partial,
  };
}

describe("InboxBell", () => {
  it("renders the bell without a badge when unreadCount is 0", () => {
    render(<InboxBell unreadCount={0} preview={[]} />);
    expect(screen.getByTestId("inbox-bell")).toBeDefined();
    expect(screen.queryByTestId("inbox-bell-badge")).toBeNull();
  });

  it("renders the badge when unreadCount > 0", () => {
    render(<InboxBell unreadCount={3} preview={[mk("a")]} />);
    expect(screen.getByTestId("inbox-bell-badge").textContent).toBe("3");
  });

  it("caps the badge at 9+ when unreadCount > 9", () => {
    render(<InboxBell unreadCount={42} preview={[]} />);
    expect(screen.getByTestId("inbox-bell-badge").textContent).toBe("9+");
  });

  it("clicking the bell opens the slide-out with preview rows", () => {
    render(
      <InboxBell
        unreadCount={2}
        preview={[mk("a", { title: "Your flag was accepted" }), mk("b", { title: "New skill suggested" })]}
      />,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByTestId("inbox-bell"));
    expect(screen.getByRole("dialog")).toBeDefined();
    expect(screen.getByText("Your flag was accepted")).toBeDefined();
    expect(screen.getByText("New skill suggested")).toBeDefined();
  });

  it("'See all' link routes to /inbox", () => {
    render(<InboxBell unreadCount={1} preview={[mk("a")]} />);
    fireEvent.click(screen.getByTestId("inbox-bell"));
    const seeAll = screen.getByText("See all →") as HTMLAnchorElement;
    expect(seeAll.getAttribute("href")).toBe("/inbox");
  });

  it("Escape key closes the slide-out", () => {
    render(<InboxBell unreadCount={1} preview={[mk("a")]} />);
    fireEvent.click(screen.getByTestId("inbox-bell"));
    expect(screen.getByRole("dialog")).toBeDefined();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("queue_item rows link to /queue/<id>; memory rows link to /brain/<id>", () => {
    const items = [
      mk("q", { source_kind: "queue_item", source_queue_item_id: "q-uuid", title: "Q" }),
      mk("m", { source_kind: "memory_file", source_memory_id: "m-uuid", title: "M" }),
    ];
    render(<InboxBell unreadCount={2} preview={items} />);
    fireEvent.click(screen.getByTestId("inbox-bell"));
    const qLink = screen.getByText("Q").closest("a") as HTMLAnchorElement;
    const mLink = screen.getByText("M").closest("a") as HTMLAnchorElement;
    expect(qLink.getAttribute("href")).toBe("/queue/q-uuid");
    expect(mLink.getAttribute("href")).toBe("/brain/m-uuid");
  });

  it("falls back to /inbox when no source is set", () => {
    const items = [mk("plain", { title: "Just text", source_kind: null })];
    render(<InboxBell unreadCount={1} preview={items} />);
    fireEvent.click(screen.getByTestId("inbox-bell"));
    const link = screen.getByText("Just text").closest("a") as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("/inbox");
  });

  it("renders 'No unread notifications.' when preview is empty but badge could still exist", () => {
    render(<InboxBell unreadCount={0} preview={[]} />);
    fireEvent.click(screen.getByTestId("inbox-bell"));
    expect(screen.getByText("No unread notifications.")).toBeDefined();
  });
});

void vi; // silence unused import warning if no mocks land later
