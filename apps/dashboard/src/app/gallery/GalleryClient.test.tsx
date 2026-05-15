// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import GalleryClient from "./GalleryClient";
import type { GalleryTemplate } from "@/lib/studio/gallery";

// GalleryClient renders <AskBbc />, which uses next/navigation's useRouter and
// the routeTask server action -- both stubbed so the gallery tests stay unit.
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/studio/route-task-action", () => ({ routeTask: vi.fn() }));

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
    render(<GalleryClient templates={FIXTURES} recentRuns={[]} />);
    expect(screen.getByText("Tweet thread")).toBeTruthy();
    expect(screen.getByText("Runway analysis")).toBeTruthy();
  });
  it("filters by search query", () => {
    render(<GalleryClient templates={FIXTURES} recentRuns={[]} />);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "runway" } });
    expect(screen.queryByText("Tweet thread")).toBeNull();
    expect(screen.getByText("Runway analysis")).toBeTruthy();
  });
  it("filters by role chip, matching facets too", () => {
    render(<GalleryClient templates={FIXTURES} recentRuns={[]} />);
    fireEvent.click(screen.getByRole("button", { name: /founder/i }));
    expect(screen.getByText("Runway analysis")).toBeTruthy(); // founder is a facet
    expect(screen.queryByText("Tweet thread")).toBeNull();
  });
});
