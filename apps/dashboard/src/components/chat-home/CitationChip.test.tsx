// @vitest-environment jsdom

import { describe, expect, it, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";

import { CitationChip } from "./CitationChip";

describe("CitationChip", () => {
  afterEach(cleanup);

  it("emits data-type attribute matching the memory type", () => {
    const { container } = render(
      <CitationChip memoryId="abc-123" label="auth decision" type="decision" />,
    );
    const chip = container.querySelector('[data-type="decision"]');
    expect(chip).not.toBeNull();
  });

  it("uses the .citation-chip class so per-type CSS rules apply", () => {
    const { container } = render(
      <CitationChip memoryId="abc-123" label="auth decision" type="decision" />,
    );
    expect(container.querySelector(".citation-chip")).not.toBeNull();
  });

  it("omits data-type when type is not provided", () => {
    const { container } = render(
      <CitationChip memoryId="abc-123" label="unknown" />,
    );
    const chip = container.querySelector("[data-type]");
    expect(chip).toBeNull();
  });

  it("still links to /memory/<id>", () => {
    const { container } = render(
      <CitationChip memoryId="abc-123" label="x" type="voice" />,
    );
    const anchor = container.querySelector("a");
    expect(anchor?.getAttribute("href")).toBe("/memory/abc-123");
  });

  it("falls back to short id prefix when label is missing", () => {
    const { container } = render(<CitationChip memoryId="abcdef1234" />);
    expect(container.textContent).toContain("memory · abcdef");
  });
});
