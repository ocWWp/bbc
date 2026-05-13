// @vitest-environment jsdom

import { describe, expect, it, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { BrainSidebar } from "./BrainSidebar";
import { ROLE_SHAPES } from "@/lib/studio/role-shapes";

afterEach(cleanup);

const fullBrain = {
  voice: {
    register: "casual",
    do_words: ["ship", "tight", "minimum"],
    dont_words: [],
    example_phrases: [],
  },
  recent_decisions: [
    { id: "d1", title: "Use Supabase RLS", decision: "..." },
    { id: "d2", title: "AGPLv3", decision: "..." },
  ],
  vendors: [{ id: "v1", name: "Resend", role: "email" }],
  team: [{ id: "p1", name: "Alice", role: "maintainer" }],
  glossary: {
    terms: [{ id: "g1", term: "brain-dump", definition: "..." }],
  },
};

const emptyBrain = {
  voice: undefined,
  recent_decisions: [] as { id: string; title: string; decision: string }[],
  vendors: [] as { id: string; name: string; role: string }[],
  team: [] as { id: string; name: string; role: string }[],
  glossary: undefined,
};

describe("BrainSidebar", () => {
  it("renders configured sections for a full brain (marketing shape)", () => {
    render(<BrainSidebar shape={ROLE_SHAPES.marketing} brain={fullBrain} />);
    expect(screen.getByTestId("brain-sidebar")).toBeDefined();
    expect(screen.getByText("Your voice")).toBeDefined();
    expect(screen.getByText("Recent decisions")).toBeDefined();
    expect(screen.getByText("Glossary")).toBeDefined();
    // Recent-decisions items link at /brain/<id>.
    const decisionLink = screen.getByText("Use Supabase RLS").closest("a") as HTMLAnchorElement;
    expect(decisionLink.getAttribute("href")).toBe("/brain/d1");
  });

  it("shows the empty-brain CTA when every section is empty", () => {
    render(<BrainSidebar shape={ROLE_SHAPES.founder} brain={emptyBrain} />);
    expect(screen.getByTestId("brain-sidebar-empty")).toBeDefined();
    expect(screen.queryByTestId("brain-sidebar")).toBeNull();
  });

  it("hides individual sections whose items are empty (founder needs decisions+team+vendors)", () => {
    // Brain has only one decision; team and vendors arrays are empty.
    const partial = { ...emptyBrain, recent_decisions: fullBrain.recent_decisions };
    render(<BrainSidebar shape={ROLE_SHAPES.founder} brain={partial} />);
    expect(screen.getByText("Recent decisions")).toBeDefined();
    expect(screen.queryByText("Team")).toBeNull();
    expect(screen.queryByText("Vendors")).toBeNull();
  });
});
