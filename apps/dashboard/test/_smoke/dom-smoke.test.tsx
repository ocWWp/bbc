// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

// Task 0c smoke test: confirms .test.tsx files run under jsdom via the
// per-file `@vitest-environment jsdom` pragma. Without the config change in
// Task 0c, .test.tsx files would never be discovered by the default
// `pnpm test` glob and DOM assertions downstream (page-guards.test.tsx,
// component tests) would silently no-op.

describe("DOM smoke — vitest picks up .test.tsx under jsdom", () => {
  it("renders a div and reads its text content via @testing-library/react", () => {
    render(<div>hello-vitest-jsdom</div>);
    expect(screen.getByText("hello-vitest-jsdom")).toBeDefined();
  });

  it("window is defined in this test environment", () => {
    expect(typeof window).toBe("object");
    expect(window.document).toBeDefined();
  });
});
