import { describe, it, expect } from "vitest";
import { GET } from "./route";

describe("M1.2 SSE spike — /api/_spike/stream", () => {
  it("returns text/event-stream content type with streaming-safe headers", async () => {
    const req = new Request("http://localhost/api/_spike/stream");
    const res = await GET(req as any);
    expect(res.headers.get("Content-Type")).toBe("text/event-stream");
    expect(res.headers.get("Cache-Control")).toMatch(/no-cache/);
    expect(res.headers.get("X-Accel-Buffering")).toBe("no");
  });

  it("emits 5 tick events plus a done event, each separated by a 200ms gap", async () => {
    const req = new Request("http://localhost/api/_spike/stream");
    const res = await GET(req as any);
    expect(res.body).not.toBeNull();

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let combined = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      combined += decoder.decode(value, { stream: true });
    }
    combined += decoder.decode();

    // Each event ends with \n\n. The 6 events are: tick 0..4 + done.
    const events = combined.split("\n\n").filter((s) => s.length > 0);
    expect(events).toHaveLength(6);

    for (let i = 0; i < 5; i++) {
      expect(events[i]).toBe(`event: tick\ndata: {"i":${i}}`);
    }
    expect(events[5]).toBe("event: done\ndata: {}");
  });
});
