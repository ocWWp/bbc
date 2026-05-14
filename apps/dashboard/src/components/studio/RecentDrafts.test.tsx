// @vitest-environment jsdom

import { describe, expect, it, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { RecentDrafts } from "./RecentDrafts";

afterEach(cleanup);

const items = [
  {
    id: "d1",
    title: "Announcing BBC v1.5",
    templateSlug: "marketing:tweet-thread",
    status: "accepted",
    createdAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
  },
  {
    id: "d2",
    title: "Why we picked Supabase",
    templateSlug: "marketing:blog-post-draft",
    status: "pending_review",
    createdAt: new Date(Date.now() - 3 * 3600 * 1000).toISOString(),
  },
];

describe("RecentDrafts", () => {
  it("renders an empty-state when items is empty", () => {
    render(<RecentDrafts items={[]} />);
    expect(screen.getByTestId("recent-drafts-empty")).toBeDefined();
    expect(screen.queryByTestId("recent-drafts-list")).toBeNull();
  });

  it("renders one row per item with title + template + status pill", () => {
    render(<RecentDrafts items={items} />);
    const list = screen.getByTestId("recent-drafts-list");
    const rows = within(list).getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(within(list).getByText("Announcing BBC v1.5")).toBeDefined();
    expect(within(list).getByText("Why we picked Supabase")).toBeDefined();
    expect(within(list).getByText("marketing:tweet-thread")).toBeDefined();
    expect(within(list).getByText("marketing:blog-post-draft")).toBeDefined();
    expect(within(list).getByText("accepted")).toBeDefined();
    expect(within(list).getByText("pending review")).toBeDefined();
  });

  it("each row links to /studio/runs/<id> by default", () => {
    render(<RecentDrafts items={items} />);
    const link = screen.getByText("Announcing BBC v1.5").closest("a") as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("/studio/runs/d1");
  });

  it("hrefFor override redirects each row", () => {
    render(<RecentDrafts items={items} hrefFor={(id) => `/studio/marketing/runs/${id}`} />);
    const link = screen.getByText("Announcing BBC v1.5").closest("a") as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("/studio/marketing/runs/d1");
  });

  it("custom empty label replaces the default", () => {
    render(<RecentDrafts items={[]} emptyLabel="No tweets yet." />);
    expect(screen.getByText("No tweets yet.")).toBeDefined();
  });

  it("recent times render as 'm ago' / 'h ago' rel-time, not raw ISO", () => {
    render(<RecentDrafts items={items} />);
    const list = screen.getByTestId("recent-drafts-list");
    expect(within(list).getByText(/m ago/)).toBeDefined();
    expect(within(list).getByText(/h ago/)).toBeDefined();
  });
});
