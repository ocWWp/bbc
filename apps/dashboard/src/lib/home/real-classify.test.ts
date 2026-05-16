import { describe, it, expect, vi } from "vitest";
import { makeRealClassify } from "./real-classify";

type AnthropicLike = {
  messages: {
    create: ReturnType<typeof vi.fn>;
  };
};

function makeClient(toolInput: unknown, opts?: { noToolUse?: boolean }): AnthropicLike {
  const content = opts?.noToolUse
    ? [{ type: "text" as const, text: "hello" }]
    : [{ type: "tool_use" as const, name: "set_intent", input: toolInput }];
  return {
    messages: {
      create: vi.fn().mockResolvedValue({ content }),
    },
  };
}

describe("makeRealClassify", () => {
  it("returns the intent the model emitted via the tool", async () => {
    const client = makeClient({ intent: "explain" });
    const fn = makeRealClassify(client as never);
    const r = await fn({ text: "what is our voice?", recent: [] });
    expect(r.intent).toBe("explain");
  });

  it("returns 'unclear' if the model emits no tool_use block", async () => {
    const client = makeClient(null, { noToolUse: true });
    const fn = makeRealClassify(client as never);
    const r = await fn({ text: "??", recent: [] });
    expect(r.intent).toBe("unclear");
  });

  it("returns 'unclear' if the tool input is missing the intent field", async () => {
    const client = makeClient({});
    const fn = makeRealClassify(client as never);
    const r = await fn({ text: "??", recent: [] });
    expect(r.intent).toBe("unclear");
  });

  it("passes only the last 2 turns of recent context to Anthropic", async () => {
    const client = makeClient({ intent: "explain" });
    const fn = makeRealClassify(client as never);
    await fn({
      text: "what now?",
      recent: [
        { role: "user", text: "t1" },
        { role: "agent", text: "a1" },
        { role: "user", text: "t2" },
        { role: "agent", text: "a2" },
      ],
    });
    const call = client.messages.create.mock.calls[0][0];
    expect(call.messages).toHaveLength(3);
    expect(call.messages[0].content).toBe("t2");
    expect(call.messages[1].content).toBe("a2");
    expect(call.messages[2].content).toBe("what now?");
  });

  it("does not include 'watch' or 'observe-anomaly' in the allowed intent enum (PR-A scope: explain/navigate/draft/meta/unclear only)", async () => {
    const client = makeClient({ intent: "explain" });
    const fn = makeRealClassify(client as never);
    await fn({ text: "anything", recent: [] });
    const call = client.messages.create.mock.calls[0][0];
    const tool = call.tools[0];
    const allowed = tool.input_schema.properties.intent.enum;
    expect(allowed).toEqual(["navigate", "explain", "draft", "meta", "unclear"]);
    expect(allowed).not.toContain("watch");
    expect(allowed).not.toContain("observe-anomaly");
  });
});
