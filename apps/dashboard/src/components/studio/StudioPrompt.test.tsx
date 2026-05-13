// @vitest-environment jsdom

import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { StudioPrompt } from "./StudioPrompt";

afterEach(cleanup);

const chips = [
  { id: "tweet", label: "Tweet thread", templateSlug: "marketing:tweet-thread" },
  { id: "linkedin", label: "LinkedIn post", templateSlug: "marketing:linkedin-announcement" },
];

describe("StudioPrompt — hybrid prompt-first input", () => {
  it("submit button is disabled while the textarea is empty", () => {
    render(<StudioPrompt chips={chips} onSubmit={vi.fn()} />);
    const submit = screen.getByTestId("studio-prompt-submit") as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
  });

  it("typing text + clicking submit fires onSubmit({ text })", () => {
    const onSubmit = vi.fn();
    render(<StudioPrompt chips={chips} onSubmit={onSubmit} />);
    const ta = screen.getByLabelText("prompt") as HTMLTextAreaElement;
    fireEvent.change(ta, { target: { value: "announce the launch" } });
    fireEvent.click(screen.getByTestId("studio-prompt-submit"));
    expect(onSubmit).toHaveBeenCalledOnce();
    expect(onSubmit).toHaveBeenCalledWith({
      text: "announce the launch",
      templateSlug: undefined,
    });
  });

  it("clicking a chip + submitting fires onSubmit with that templateSlug", () => {
    const onSubmit = vi.fn();
    render(<StudioPrompt chips={chips} onSubmit={onSubmit} />);
    const ta = screen.getByLabelText("prompt") as HTMLTextAreaElement;
    fireEvent.change(ta, { target: { value: "ship news" } });
    fireEvent.click(screen.getByTestId("studio-chip-tweet"));
    fireEvent.click(screen.getByTestId("studio-prompt-submit"));
    expect(onSubmit).toHaveBeenCalledWith({
      text: "ship news",
      templateSlug: "marketing:tweet-thread",
    });
  });

  it("clicking an already-active chip toggles it off", () => {
    const onSubmit = vi.fn();
    render(<StudioPrompt chips={chips} onSubmit={onSubmit} />);
    const ta = screen.getByLabelText("prompt") as HTMLTextAreaElement;
    fireEvent.change(ta, { target: { value: "x" } });
    const tweet = screen.getByTestId("studio-chip-tweet");
    fireEvent.click(tweet);
    expect(tweet.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(tweet);
    expect(tweet.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(screen.getByTestId("studio-prompt-submit"));
    expect(onSubmit).toHaveBeenCalledWith({ text: "x", templateSlug: undefined });
  });

  it("whitespace-only text does not enable submit", () => {
    render(<StudioPrompt chips={chips} onSubmit={vi.fn()} />);
    const ta = screen.getByLabelText("prompt") as HTMLTextAreaElement;
    fireEvent.change(ta, { target: { value: "   \n  " } });
    expect((screen.getByTestId("studio-prompt-submit") as HTMLButtonElement).disabled).toBe(true);
  });

  it("busy=true disables every control", () => {
    render(<StudioPrompt chips={chips} onSubmit={vi.fn()} busy />);
    const ta = screen.getByLabelText("prompt") as HTMLTextAreaElement;
    expect(ta.disabled).toBe(true);
    for (const c of chips) {
      const btn = screen.getByTestId(`studio-chip-${c.id}`) as HTMLButtonElement;
      expect(btn.disabled).toBe(true);
    }
    expect((screen.getByTestId("studio-prompt-submit") as HTMLButtonElement).disabled).toBe(true);
  });

  it("cmd-enter inside the textarea submits", () => {
    const onSubmit = vi.fn();
    render(<StudioPrompt chips={chips} onSubmit={onSubmit} />);
    const ta = screen.getByLabelText("prompt") as HTMLTextAreaElement;
    fireEvent.change(ta, { target: { value: "fast path" } });
    fireEvent.keyDown(ta, { key: "Enter", metaKey: true });
    expect(onSubmit).toHaveBeenCalledWith({ text: "fast path", templateSlug: undefined });
  });
});
