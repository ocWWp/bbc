// @vitest-environment jsdom

import { describe, expect, it, afterEach, vi, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { ChatHome } from "./ChatHome";
import type { TurnViewModel } from "./TurnView";

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const GREETING = "Welcome to Acme. Tell me what you're working on.";

describe("ChatHome — empty state", () => {
  it("renders the cold-start greeting when there are no turns", () => {
    render(<ChatHome greeting={GREETING} initialTurns={[]} />);
    expect(screen.getByTestId("empty-greeting").textContent).toBe(GREETING);
  });

  it("hides the greeting once turns exist", () => {
    const turns: TurnViewModel[] = [
      {
        id: "t1",
        role: "user",
        status: "completed",
        text: "hi",
        toolCalls: [],
        citations: [],
      },
    ];
    render(<ChatHome greeting={GREETING} initialTurns={turns} />);
    expect(screen.queryByTestId("empty-greeting")).toBeNull();
  });
});

describe("ChatHome — composer", () => {
  it("disables Send until the input has content", () => {
    render(<ChatHome greeting={GREETING} initialTurns={[]} />);
    const send = screen.getByTestId("composer-send") as HTMLButtonElement;
    expect(send.disabled).toBe(true);
    fireEvent.change(screen.getByTestId("composer-input"), { target: { value: "hi" } });
    expect(send.disabled).toBe(false);
  });

  it("appends user + agent turns and consumes SSE text-delta + turn-end", async () => {
    // Build an SSE body that yields one text-delta then turn-end.
    const encoder = new TextEncoder();
    const frames = [
      `event: text-delta\ndata: ${JSON.stringify({ delta: "Hello back." })}\n\n`,
      `event: turn-end\ndata: ${JSON.stringify({ status: "completed" })}\n\n`,
    ];
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const f of frames) controller.enqueue(encoder.encode(f));
        controller.close();
      },
    });
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(stream, {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      }),
    );

    render(<ChatHome greeting={GREETING} initialTurns={[]} />);
    fireEvent.change(screen.getByTestId("composer-input"), { target: { value: "ping" } });
    fireEvent.click(screen.getByTestId("composer-send"));

    // User turn appears immediately (optimistic).
    await waitFor(() => expect(screen.getByText("ping")).toBeDefined());
    // Agent text-delta accumulates and the stream ends → completed status.
    await waitFor(() => expect(screen.getByText("Hello back.")).toBeDefined());
  });
});
