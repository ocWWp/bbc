// @vitest-environment jsdom
//
// Task 17 of v1.5 launch polish. StudioShell is a presentational layout —
// no action state, no callbacks. These tests prove the slot contract and
// the chrome (header chip, accent variable, semantic regions).

import { describe, expect, it, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { StudioShell } from "./StudioShell";

afterEach(cleanup);

describe("StudioShell — presentational slots", () => {
  it("renders tenant name + role chip + template slug in the header", () => {
    render(
      <StudioShell
        role="marketing"
        tenantName="acme"
        templateSlug="marketing:tweet-thread"
        accentColor="#f59e0b"
        promptSlot={<div>P</div>}
        recentDraftsSlot={<div>D</div>}
      />,
    );
    expect(screen.getByText("acme")).toBeDefined();
    expect(screen.getByTestId("studio-role-chip").textContent).toContain("marketing");
    expect(screen.getByText("marketing:tweet-thread")).toBeDefined();
  });

  it("does not render a template chip when templateSlug is null", () => {
    render(
      <StudioShell
        role="founder"
        tenantName="acme"
        templateSlug={null}
        accentColor="#3b82f6"
        promptSlot={<div>P</div>}
        recentDraftsSlot={<div>D</div>}
      />,
    );
    expect(screen.queryByText(/founder:/)).toBeNull();
    expect(screen.queryByText(/marketing:/)).toBeNull();
  });

  it("applies accentColor as the --studio-accent CSS variable", () => {
    const { container } = render(
      <StudioShell
        role="engineering"
        tenantName="acme"
        templateSlug={null}
        accentColor="#10b981"
        promptSlot={<div>P</div>}
        recentDraftsSlot={<div>D</div>}
      />,
    );
    const root = container.querySelector(".studio-shell") as HTMLElement;
    expect(root.style.getPropertyValue("--studio-accent")).toBe("#10b981");
    expect(root.getAttribute("data-role")).toBe("engineering");
  });

  it("renders all four slots when provided", () => {
    render(
      <StudioShell
        role="marketing"
        tenantName="acme"
        templateSlug="marketing:tweet-thread"
        accentColor="#f59e0b"
        promptSlot={<div data-testid="slot-prompt">prompt-here</div>}
        recentDraftsSlot={<div data-testid="slot-drafts">drafts-here</div>}
        sidebarSlot={<div data-testid="slot-sidebar">sidebar-here</div>}
        bodySlot={<div data-testid="slot-body">body-here</div>}
      />,
    );
    expect(screen.getByTestId("slot-prompt")).toBeDefined();
    expect(screen.getByTestId("slot-drafts")).toBeDefined();
    expect(screen.getByTestId("slot-sidebar")).toBeDefined();
    expect(screen.getByTestId("slot-body")).toBeDefined();
  });

  it("omits sidebar and body regions when those slots are not provided", () => {
    const { container } = render(
      <StudioShell
        role="support"
        tenantName="acme"
        templateSlug={null}
        accentColor="#a855f7"
        promptSlot={<div>P</div>}
        recentDraftsSlot={<div>D</div>}
      />,
    );
    expect(container.querySelector('[aria-label="brain context"]')).toBeNull();
    expect(container.querySelector('[aria-label="output"]')).toBeNull();
    expect(container.querySelector('[aria-label="prompt"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="recent drafts"]')).not.toBeNull();
  });

  it("omits the prompt region when promptSlot is undefined (v1.5 wrap pattern)", () => {
    // Studios whose existing client renders its own prompt internally pass
    // the entire client as bodySlot and leave promptSlot undefined. Shell
    // should not render an empty prompt section in that case.
    const { container } = render(
      <StudioShell
        role="marketing"
        tenantName="acme"
        templateSlug="marketing:tweet-thread"
        accentColor="#f59e0b"
        recentDraftsSlot={<div>D</div>}
        bodySlot={<div data-testid="existing-client">existing client renders here</div>}
      />,
    );
    expect(container.querySelector('[aria-label="prompt"]')).toBeNull();
    expect(screen.getByTestId("existing-client")).toBeDefined();
  });
});
