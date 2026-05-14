// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import GalleryClient from "./GalleryClient";
import type { GalleryTemplate } from "@/lib/studio/gallery";

afterEach(cleanup);

const FIXTURES: GalleryTemplate[] = [
  {
    id: "marketing:tweet",
    label: "Tweet thread",
    hint: "short posts",
    kind: "x_thread",
    firstUseInputs: [],
    owningRole: "marketing",
    roles: ["marketing"],
    roleLabel: "Marketing Studio",
    accentColor: "#f59e0b",
  },
  {
    id: "finance:runway",
    label: "Runway analysis",
    hint: "cash forecast",
    kind: "doc",
    firstUseInputs: [],
    owningRole: "finance",
    roles: ["finance", "founder"],
    roleLabel: "Finance Studio",
    accentColor: "#0d9488",
  },
];

describe("GalleryClient", () => {
  it("renders every template by default", () => {
    render(<GalleryClient templates={FIXTURES} />);
    expect(screen.getByText("Tweet thread")).toBeTruthy();
    expect(screen.getByText("Runway analysis")).toBeTruthy();
  });
  it("filters by search query", () => {
    render(<GalleryClient templates={FIXTURES} />);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "runway" } });
    expect(screen.queryByText("Tweet thread")).toBeNull();
    expect(screen.getByText("Runway analysis")).toBeTruthy();
  });
  it("filters by role chip, matching facets too", () => {
    render(<GalleryClient templates={FIXTURES} />);
    fireEvent.click(screen.getByRole("button", { name: /founder/i }));
    expect(screen.getByText("Runway analysis")).toBeTruthy(); // founder is a facet
    expect(screen.queryByText("Tweet thread")).toBeNull();
  });
});
