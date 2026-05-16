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

  it("populates the composer when an example prompt chip is clicked (F6)", () => {
    render(<ChatHome greeting={GREETING} initialTurns={[]} />);
    const explainChip = screen.getByTestId("example-prompt-explain");
    fireEvent.click(explainChip);
    const input = screen.getByTestId("composer-input") as HTMLTextAreaElement;
    // The chip prompt has been loaded; user can edit before sending.
    expect(input.value.length).toBeGreaterThan(0);
    expect(input.value).toMatch(/voice and tone/i);
    // Send becomes enabled.
    const send = screen.getByTestId("composer-send") as HTMLButtonElement;
    expect(send.disabled).toBe(false);
  });

  it("posts the chip prompt verbatim when send fires in the same tick (F6 race)", async () => {
    // Codex flagged: click-then-send-in-same-event-loop may post stale
    // draft. Verify the React state update is visible to send() by the
    // time the click handler returns.
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            `event: turn-end\ndata: ${JSON.stringify({ status: "completed" })}\n\n`,
          ),
        );
        controller.close();
      },
    });
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(stream, {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      }),
    );
    render(<ChatHome greeting={GREETING} initialTurns={[]} />);
    fireEvent.click(screen.getByTestId("example-prompt-navigate"));
    fireEvent.click(screen.getByTestId("composer-send"));
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    const callArgs = fetchSpy.mock.calls[0]!;
    const body = JSON.parse(String(callArgs[1]?.body));
    expect(body.userText).toMatch(/api keys/i);
  });
});
