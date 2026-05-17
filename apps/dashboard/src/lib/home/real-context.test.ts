import { describe, it, expect } from "vitest";
import {
  makeBuildContextFromRetrieval,
  retrievedMemoryIdsOf,
  type HomeRetrieval,
} from "./real-context";

function row(opts: {
  id: string;
  type?: string | null;
  title?: string | null;
  fields?: unknown;
}): HomeRetrieval["rows"][number] {
  return {
    id: opts.id,
    type: opts.type ?? null,
    title: opts.title ?? null,
    fields: opts.fields ?? {},
    updated_at: "2026-05-15T00:00:00Z",
  };
}

describe("makeBuildContextFromRetrieval", () => {
  it("returns the workspace name from the retrieval", async () => {
    const retrieval: HomeRetrieval = { workspaceName: "8azi", rows: [] };
    const build = makeBuildContextFromRetrieval(retrieval);
    const ctx = await build({
      tenantId: "t1",
      actorId: "u1",
      role: "member",
      userInput: "anything",
      recent: [],
    });
    expect(ctx.alwaysOn.workspaceName).toBe("8azi");
  });

  it("builds the memoryIndexExcerpt as a list of typed lines with mem ids", async () => {
    const retrieval: HomeRetrieval = {
      workspaceName: "ws",
      rows: [
        row({ id: "a", type: "voice", title: "Voice rule" }),
        row({ id: "b", type: "decision", title: "ADR-0008" }),
      ],
    };
    const build = makeBuildContextFromRetrieval(retrieval);
    const ctx = await build({
      tenantId: "t1",
      actorId: "u1",
      role: "member",
      userInput: "anything",
      recent: [],
    });
    expect(ctx.alwaysOn.memoryIndexExcerpt).toContain("- voice: Voice rule [mem:a]");
    expect(ctx.alwaysOn.memoryIndexExcerpt).toContain("- decision: ADR-0008 [mem:b]");
  });

  it("populates rolePack.voice from a parseable voice row", async () => {
    const retrieval: HomeRetrieval = {
      workspaceName: "ws",
      rows: [
        row({
          id: "v",
          type: "voice",
          title: "Voice",
          fields: {
            register: "casual",
            do_words: ["ship", "compound"],
            dont_words: ["leverage", "synergy"],
            example_phrases: [],
            audience: "founders",
          },
        }),
      ],
    };
    const build = makeBuildContextFromRetrieval(retrieval);
    const ctx = await build({
      tenantId: "t1",
      actorId: "u1",
      role: "member",
      userInput: "x",
      recent: [],
    });
    expect(ctx.rolePack.voice).toContain("casual");
    expect(ctx.rolePack.voice).toContain("ship");
    expect(ctx.rolePack.voice).toContain("leverage");
  });

  it("populates vendors, decisions, glossary from typed rows", async () => {
    const retrieval: HomeRetrieval = {
      workspaceName: "ws",
      rows: [
        row({
          id: "vend1",
          type: "vendor",
          title: "Anthropic",
          fields: { vendor_name: "Anthropic", role: "llm-provider", status: "active" },
        }),
        row({ id: "dec1", type: "decision", title: "ADR-0008 three loops" }),
        row({
          id: "gloss1",
          type: "glossary",
          title: "supertag",
          fields: { term: "supertag", definition: "A typed memory category" },
        }),
      ],
    };
    const build = makeBuildContextFromRetrieval(retrieval);
    const ctx = await build({
      tenantId: "t1",
      actorId: "u1",
      role: "member",
      userInput: "x",
      recent: [],
    });
    expect(ctx.rolePack.vendors).toContain("Anthropic");
    expect(ctx.rolePack.decisions).toEqual([{ id: "dec1", title: "ADR-0008 three loops" }]);
    expect(ctx.rolePack.glossary.supertag).toBe("A typed memory category");
  });

  it("passes user input and recent turns through to the buffer", async () => {
    const retrieval: HomeRetrieval = { workspaceName: "ws", rows: [] };
    const build = makeBuildContextFromRetrieval(retrieval);
    const ctx = await build({
      tenantId: "t1",
      actorId: "u1",
      role: "member",
      userInput: "what's our voice?",
      recent: [{ role: "user", text: "earlier" }],
    });
    expect(ctx.buffer.kind).toBe("conversation");
    if (ctx.buffer.kind === "conversation") {
      expect(ctx.buffer.userInput).toBe("what's our voice?");
      expect(ctx.buffer.turns).toHaveLength(1);
    }
  });
});

describe("retrievedMemoryIdsOf", () => {
  it("returns the row IDs in retrieval order", () => {
    const retrieval: HomeRetrieval = {
      workspaceName: "ws",
      rows: [row({ id: "a" }), row({ id: "b" }), row({ id: "c" })],
    };
    expect(retrievedMemoryIdsOf(retrieval)).toEqual(["a", "b", "c"]);
  });
});
