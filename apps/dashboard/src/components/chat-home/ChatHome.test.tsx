// @vitest-environment jsdom

import { createRef } from "react";
import { describe, expect, it, afterEach, vi, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

// Mock next/navigation + sonner. Use vi.hoisted so the spies are
// initialized before vi.mock's factory runs (vi.mock is hoisted to
// the top of the file, ahead of any normal `const`).
const { mockReplace, mockRefresh, mockPush, mockToastError } = vi.hoisted(() => ({
  mockReplace: vi.fn(),
  mockRefresh: vi.fn(),
  mockPush: vi.fn(),
  mockToastError: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace, refresh: mockRefresh, push: mockPush }),
}));
vi.mock("sonner", () => ({
  toast: { error: mockToastError },
}));

import { ChatHome } from "./ChatHome";
import type { TurnViewModel } from "./TurnView";

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  mockReplace.mockReset();
  mockRefresh.mockReset();
  mockPush.mockReset();
  mockToastError.mockReset();
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

  it("sends sessionId in POST body when prop is provided (PR-C M18)", async () => {
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
    render(<ChatHome greeting={GREETING} initialTurns={[]} sessionId="abc-123" />);
    fireEvent.change(screen.getByTestId("composer-input"), { target: { value: "hi" } });
    fireEvent.click(screen.getByTestId("composer-send"));
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    const body = JSON.parse(String(fetchSpy.mock.calls[0]![1]?.body));
    expect(body.sessionId).toBe("abc-123");
  });

  it("sends sessionId: null when no session is active (PR-C M18)", async () => {
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
    render(<ChatHome greeting={GREETING} initialTurns={[]} sessionId={null} />);
    fireEvent.change(screen.getByTestId("composer-input"), { target: { value: "hi" } });
    fireEvent.click(screen.getByTestId("composer-send"));
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    const body = JSON.parse(String(fetchSpy.mock.calls[0]![1]?.body));
    expect(body.sessionId).toBeNull();
  });

  it("buffers session-created and defers navigate until turn-end (PR-C M19)", async () => {
    const encoder = new TextEncoder();
    // Two-event stream: session-created, then turn-end. Both queued at once
    // so we can interrogate router.replace between events via the test's
    // own settle ordering.
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            `event: session-created\ndata: ${JSON.stringify({ sessionId: "new-sess-1", title: "Greeting" })}\n\n`,
          ),
        );
        controller.enqueue(
          encoder.encode(
            `event: turn-end\ndata: ${JSON.stringify({ status: "completed" })}\n\n`,
          ),
        );
        controller.close();
      },
    });
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(stream, {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      }),
    );
    render(<ChatHome greeting={GREETING} initialTurns={[]} sessionId={null} />);
    fireEvent.change(screen.getByTestId("composer-input"), { target: { value: "hi" } });
    fireEvent.click(screen.getByTestId("composer-send"));
    // After both events drain + the finally block runs, the URL flip fires
    // exactly once with the buffered id.
    await waitFor(() => expect(mockReplace).toHaveBeenCalledTimes(1));
    expect(mockReplace).toHaveBeenCalledWith("?session=new-sess-1");
    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });

  it("does not call router.replace for an existing-session turn (PR-C M19)", async () => {
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
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(stream, {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      }),
    );
    render(<ChatHome greeting={GREETING} initialTurns={[]} sessionId="abc-123" />);
    fireEvent.change(screen.getByTestId("composer-input"), { target: { value: "hi" } });
    fireEvent.click(screen.getByTestId("composer-send"));
    // Wait for the turn to settle so the finally block runs.
    await waitFor(() =>
      expect(
        (screen.getByTestId("composer-input") as HTMLTextAreaElement).disabled,
      ).toBe(false),
    );
    expect(mockReplace).not.toHaveBeenCalled();
    expect(mockRefresh).not.toHaveBeenCalled();
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

  it("on 410 clears optimistic turns, toasts, and pushes /home (PR-C M20)", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "session_not_found" }), {
        status: 410,
        headers: { "content-type": "application/json" },
      }),
    );
    render(<ChatHome greeting={GREETING} initialTurns={[]} sessionId="dead-sess" />);
    fireEvent.change(screen.getByTestId("composer-input"), { target: { value: "hi" } });
    fireEvent.click(screen.getByTestId("composer-send"));
    // Optimistic user bubble shows up first…
    await waitFor(() => expect(screen.getByText("hi")).toBeDefined());
    // …then gets cleared once the 410 lands.
    await waitFor(() => expect(screen.queryByText("hi")).toBeNull());
    expect(mockToastError).toHaveBeenCalledWith("This chat was deleted");
    expect(mockPush).toHaveBeenCalledWith("/home");
  });

  it("aborts the in-flight controller on unmount (PR-C M21)", async () => {
    // Build a stream that never closes — the read loop stays open until
    // unmount triggers the AbortController.
    const stream = new ReadableStream<Uint8Array>({
      start() {
        // No enqueue, no close — read() will park indefinitely.
      },
    });
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(stream, {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      }),
    );
    const abortSpy = vi.spyOn(AbortController.prototype, "abort");

    const { unmount } = render(
      <ChatHome greeting={GREETING} initialTurns={[]} sessionId={null} />,
    );
    fireEvent.change(screen.getByTestId("composer-input"), { target: { value: "hi" } });
    fireEvent.click(screen.getByTestId("composer-send"));
    // Wait for the optimistic user bubble — confirms send() ran far enough
    // to attach the AbortController to abortRef.
    await waitFor(() => expect(screen.getByText("hi")).toBeDefined());
    unmount();
    expect(abortSpy).toHaveBeenCalled();
  });

  it("assigns the in-flight controller to the parent abortRef (PR-C M22)", async () => {
    // Stream that doesn't close — gives us time to inspect the ref.
    const stream = new ReadableStream<Uint8Array>({ start() {} });
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(stream, {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      }),
    );
    const externalRef = createRef<AbortController | null>() as React.MutableRefObject<
      AbortController | null
    >;
    externalRef.current = null;
    render(
      <ChatHome
        greeting={GREETING}
        initialTurns={[]}
        sessionId={null}
        abortRef={externalRef}
      />,
    );
    fireEvent.change(screen.getByTestId("composer-input"), { target: { value: "hi" } });
    fireEvent.click(screen.getByTestId("composer-send"));
    await waitFor(() => expect(externalRef.current).not.toBeNull());
    expect(externalRef.current).toBeInstanceOf(AbortController);
  });

  it("externally-aborted controller marks the in-progress turn aborted (PR-C M22)", async () => {
    // Mock fetch that observes the AbortSignal — when the external ref's
    // controller fires .abort(), the underlying ReadableStream errors and
    // the reader throws AbortError into ChatHome's catch.
    vi.spyOn(global, "fetch").mockImplementation(async (_input, init) => {
      const signal = (init as RequestInit | undefined)?.signal;
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          if (signal) {
            signal.addEventListener("abort", () => {
              const err = new Error("aborted");
              err.name = "AbortError";
              controller.error(err);
            });
          }
        },
      });
      return new Response(stream, {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      });
    });
    const externalRef = createRef<AbortController | null>() as React.MutableRefObject<
      AbortController | null
    >;
    externalRef.current = null;
    render(
      <ChatHome
        greeting={GREETING}
        initialTurns={[]}
        sessionId="abc-123"
        abortRef={externalRef}
      />,
    );
    fireEvent.change(screen.getByTestId("composer-input"), { target: { value: "hi" } });
    fireEvent.click(screen.getByTestId("composer-send"));
    // Wait for the external ref to receive the live controller.
    await waitFor(() => expect(externalRef.current).not.toBeNull());
    // External delete-handler simulates tearing down the stream.
    externalRef.current!.abort();
    // The composer re-enables once the catch/finally runs.
    await waitFor(() =>
      expect(
        (screen.getByTestId("composer-input") as HTMLTextAreaElement).disabled,
      ).toBe(false),
    );
    // External ref is cleared after the finally block.
    expect(externalRef.current).toBeNull();
  });

  it("does not toast or redirect on a normal 200 stream (PR-C M20)", async () => {
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
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(stream, {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      }),
    );
    render(<ChatHome greeting={GREETING} initialTurns={[]} sessionId="abc-123" />);
    fireEvent.change(screen.getByTestId("composer-input"), { target: { value: "hi" } });
    fireEvent.click(screen.getByTestId("composer-send"));
    await waitFor(() =>
      expect(
        (screen.getByTestId("composer-input") as HTMLTextAreaElement).disabled,
      ).toBe(false),
    );
    expect(mockToastError).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });
});
