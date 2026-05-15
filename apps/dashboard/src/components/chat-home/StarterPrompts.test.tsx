// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import StarterPrompts, { STARTER_PROMPTS } from "./StarterPrompts";

afterEach(cleanup);

describe("StarterPrompts", () => {
  it("renders all 6 prompts as buttons", () => {
    render(<StarterPrompts onPick={vi.fn()} promoted={false} />);
    expect(screen.getAllByRole("button")).toHaveLength(STARTER_PROMPTS.length);
  });

  it("calls onPick with the task text when a pill is clicked", () => {
    const onPick = vi.fn();
    render(<StarterPrompts onPick={onPick} promoted={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Draft an NDA" }));
    expect(onPick).toHaveBeenCalledWith("draft an NDA for a contractor");
  });

  it("shows the 'no runs yet' eyebrow when promoted=true", () => {
    render(<StarterPrompts onPick={vi.fn()} promoted={true} />);
    expect(screen.getByText(/no runs yet/i)).toBeTruthy();
  });

  it("does not show the eyebrow when promoted=false", () => {
    render(<StarterPrompts onPick={vi.fn()} promoted={false} />);
    expect(screen.queryByText(/no runs yet/i)).toBeNull();
  });
});
