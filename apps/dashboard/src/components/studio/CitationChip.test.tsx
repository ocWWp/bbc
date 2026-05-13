// @vitest-environment jsdom

import { describe, expect, it, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { CitationChip } from "./CitationChip";

afterEach(cleanup);

describe("CitationChip", () => {
  it("renders as a Link to /brain/<memoryId>", () => {
    render(<CitationChip memoryId="m_abc" type="decision" label="Use Supabase RLS" />);
    const link = screen.getByTestId("citation-chip") as HTMLAnchorElement;
    expect(link.tagName).toBe("A");
    expect(link.getAttribute("href")).toBe("/brain/m_abc");
    expect(link.textContent).toContain("Use Supabase RLS");
  });

  it("shows the bracketed citation number when provided", () => {
    render(
      <CitationChip memoryId="m1" type="voice" label="Lowercase social" citationNumber={3} />,
    );
    expect(screen.getByText("[3]")).toBeDefined();
  });

  it("omits the bracketed number when not provided", () => {
    render(<CitationChip memoryId="m1" type="voice" label="x" />);
    expect(screen.queryByText(/^\[\d+\]$/)).toBeNull();
  });

  it("falls back to memoryId when label is empty", () => {
    render(<CitationChip memoryId="m_xyz" type="decision" label="" />);
    expect(screen.getByText("m_xyz")).toBeDefined();
  });

  it("handles a null type by skipping the type chip (no crash)", () => {
    render(<CitationChip memoryId="m1" type={null} label="No type" />);
    expect(screen.getByText("No type")).toBeDefined();
  });
});
