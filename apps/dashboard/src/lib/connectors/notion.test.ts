// D-W3-2 tests for the Notion connector.
//
// Per docs/plans/2026-05-12-bbc-launch-plan.md §3 / Week 3:
//   - first sync emits typed proposals to /queue
//   - preview returns 10 sample rows
//   - mapping per design §4: property `type` drives supertag, body renders markdown
//
// HTTP is mocked end-to-end via NotionFetch injection.

import { describe, expect, it } from "vitest";
import {
  blocksToMarkdown,
  createNotionConnector,
  pageToProposal,
  parseConfig,
  type NotionFetch,
} from "./notion";
import type { MemoryProposal, SyncContext } from "./framework";

// --------------------------------------------------------------------------
// Mock HTTP
// --------------------------------------------------------------------------

type RouteHandler = (init?: { method?: string; body?: string }) => Response;
type Response = { ok: boolean; status: number; body?: unknown; headers?: Record<string, string> };

function mockFetch(routes: Record<string, RouteHandler>): { fetch: NotionFetch; calls: { url: string; body?: unknown }[] } {
  const calls: { url: string; body?: unknown }[] = [];
  const fetchImpl: NotionFetch = async (url, init) => {
    let parsedBody: unknown = undefined;
    if (init?.body) {
      try { parsedBody = JSON.parse(init.body); } catch { /* ignore */ }
    }
    calls.push({ url, body: parsedBody });
    const matched = Object.keys(routes).find((prefix) => url.startsWith(prefix));
    if (!matched) {
      return {
        ok: false,
        status: 404,
        json: async () => ({ message: `no mock for ${url}` }),
        text: async () => `no mock for ${url}`,
        headers: { get: () => null },
      };
    }
    const r = routes[matched](init);
    return {
      ok: r.ok,
      status: r.status,
      json: async () => r.body,
      text: async () => (typeof r.body === "string" ? r.body : JSON.stringify(r.body)),
      headers: { get: (n: string) => r.headers?.[n.toLowerCase()] ?? null },
    };
  };
  return { fetch: fetchImpl, calls };
}

function ok(body: unknown): RouteHandler {
  return () => ({ ok: true, status: 200, body });
}

function makePage(id: string, properties: Record<string, unknown>, opts: { archived?: boolean; url?: string } = {}): unknown {
  return {
    object: "page",
    id,
    url: opts.url ?? `https://notion.so/${id}`,
    archived: opts.archived ?? false,
    properties,
  };
}

function titleProp(text: string): unknown {
  return { type: "title", title: [{ plain_text: text }] };
}

function selectProp(name: string): unknown {
  return { type: "select", select: { name } };
}

function dateProp(start: string): unknown {
  return { type: "date", date: { start, end: null } };
}

// --------------------------------------------------------------------------
// parseConfig
// --------------------------------------------------------------------------

describe("parseConfig", () => {
  it("defaults make sense for an empty config", () => {
    const c = parseConfig({});
    expect(c.type_property).toBe("type");
    expect(c.title_property).toBeNull();
    expect(c.page_size).toBe(200);
  });

  it("respects overrides", () => {
    const c = parseConfig({ type_property: "Kind", title_property: "Name", page_size: 50 });
    expect(c.type_property).toBe("Kind");
    expect(c.title_property).toBe("Name");
    expect(c.page_size).toBe(50);
  });

  it("caps page_size at 500 and rejects non-positive", () => {
    expect(parseConfig({ page_size: 9999 }).page_size).toBe(500);
    expect(parseConfig({ page_size: 0 }).page_size).toBe(200);
    expect(parseConfig({ page_size: -10 }).page_size).toBe(200);
    expect(parseConfig({ page_size: "lots" }).page_size).toBe(200);
  });
});

// --------------------------------------------------------------------------
// pageToProposal — mapping spec
// --------------------------------------------------------------------------

describe("pageToProposal", () => {
  const cfg = parseConfig({});

  it("emits a note when no type property", () => {
    const page = makePage("p1", { Name: titleProp("Hello") });
    const out = pageToProposal(cfg, page as never, "body");
    expect(out.type).toBe("note");
    expect(out.title).toBe("Hello");
    expect(out.source_ref).toBe("notion:p1");
    expect(out.fields.source_kind).toBe("notion_page");
    expect(out.fields.source_permalink).toBe("https://notion.so/p1");
  });

  it("maps type=decision via select property", () => {
    const page = makePage("p2", {
      Name: titleProp("Use Postgres"),
      type: selectProp("decision"),
    });
    const out = pageToProposal(cfg, page as never, "");
    expect(out.type).toBe("decision");
    expect(out.title).toBe("Use Postgres");
  });

  it("attaches decision_date when type=decision + Date property present", () => {
    const page = makePage("p3", {
      Name: titleProp("Hire Ruth"),
      type: selectProp("decision"),
      When: dateProp("2026-04-12"),
    });
    const out = pageToProposal(cfg, page as never, "");
    expect(out.fields.decision_date).toBe("2026-04-12");
  });

  it("ignores Date property when type is not decision", () => {
    const page = makePage("p4", {
      Name: titleProp("Random note"),
      When: dateProp("2026-04-12"),
    });
    const out = pageToProposal(cfg, page as never, "");
    expect(out.fields.decision_date).toBeUndefined();
  });

  it("unknown supertag value falls back to note (defensive)", () => {
    const page = makePage("p5", {
      Name: titleProp("Hi"),
      type: selectProp("epic"), // not a BBC supertag
    });
    expect(pageToProposal(cfg, page as never, "").type).toBe("note");
  });

  it("truncates title at 200 chars", () => {
    const long = "x".repeat(300);
    const page = makePage("p6", { Name: titleProp(long) });
    expect(pageToProposal(cfg, page as never, "").title.length).toBe(200);
  });

  it("falls back to 'Untitled' when no title resolvable", () => {
    const page = makePage("p7", { type: selectProp("note") });
    expect(pageToProposal(cfg, page as never, "").title).toBe("Untitled");
  });

  it("honors a configured title_property", () => {
    const c = parseConfig({ title_property: "Display" });
    const page = makePage("p8", {
      Name: titleProp("ignored"),
      Display: { type: "rich_text", rich_text: [{ plain_text: "from-display" }] },
    });
    expect(pageToProposal(c, page as never, "").title).toBe("from-display");
  });

  it("honors a configured type_property", () => {
    const c = parseConfig({ type_property: "Kind" });
    const page = makePage("p9", {
      Name: titleProp("X"),
      Kind: selectProp("glossary"),
    });
    expect(pageToProposal(c, page as never, "").type).toBe("glossary");
  });

  it("rejects types outside the writes_to manifest (codex-flagged [P2])", () => {
    // writes_to is ['decision', 'note', 'glossary', 'product']. A page tagged
    // 'vendor' or 'team' must fall back to 'note' — connectors must not write
    // types they don't advertise.
    for (const reserved of ["vendor", "team", "skill", "voice", "source_artifact"]) {
      const page = makePage(`p-${reserved}`, {
        Name: titleProp("X"),
        type: selectProp(reserved),
      });
      expect(pageToProposal(cfg, page as never, "").type).toBe("note");
    }
  });
});

// --------------------------------------------------------------------------
// blocksToMarkdown
// --------------------------------------------------------------------------

describe("blocksToMarkdown", () => {
  function block(type: string, text: string, extra: Record<string, unknown> = {}): unknown {
    return {
      object: "block",
      id: "b" + Math.random(),
      type,
      has_children: false,
      [type]: { rich_text: [{ plain_text: text }], ...extra },
    };
  }

  it("renders headings + paragraphs + lists", () => {
    const md = blocksToMarkdown([
      block("heading_1", "Title") as never,
      block("paragraph", "Some body.") as never,
      block("heading_2", "Sub") as never,
      block("bulleted_list_item", "one") as never,
      block("bulleted_list_item", "two") as never,
    ]);
    expect(md).toBe("# Title\nSome body.\n## Sub\n- one\n- two");
  });

  it("renders to_do with checked state", () => {
    const md = blocksToMarkdown([
      { object: "block", id: "1", type: "to_do", has_children: false, to_do: { rich_text: [{ plain_text: "buy milk" }], checked: false } } as never,
      { object: "block", id: "2", type: "to_do", has_children: false, to_do: { rich_text: [{ plain_text: "buy bread" }], checked: true } } as never,
    ]);
    expect(md).toContain("- [ ] buy milk");
    expect(md).toContain("- [x] buy bread");
  });

  it("renders code blocks with language fence", () => {
    const md = blocksToMarkdown([
      { object: "block", id: "1", type: "code", has_children: false, code: { rich_text: [{ plain_text: "const x = 1" }], language: "ts" } } as never,
    ]);
    expect(md).toBe("```ts\nconst x = 1\n```");
  });

  it("renders dividers and quotes", () => {
    const md = blocksToMarkdown([
      block("quote", "stand back") as never,
      { object: "block", id: "2", type: "divider", has_children: false } as never,
      block("paragraph", "after") as never,
    ]);
    expect(md).toBe("> stand back\n---\nafter");
  });

  it("falls back to plain text on unknown block types", () => {
    const md = blocksToMarkdown([
      block("callout", "important!") as never,
    ]);
    expect(md).toBe("important!");
  });

  it("returns empty string for empty input", () => {
    expect(blocksToMarkdown([])).toBe("");
  });
});

// --------------------------------------------------------------------------
// sync — end-to-end via mocked Notion API
// --------------------------------------------------------------------------

const SEARCH_URL = "https://api.notion.com/v1/search";

async function collectSync(
  routes: Record<string, RouteHandler>,
  cursor: string | null = null,
  config: Record<string, unknown> = {},
): Promise<{ proposals: MemoryProposal[]; checkpoints: (string | null)[]; calls: { url: string }[] }> {
  const { fetch, calls } = mockFetch(routes);
  const connector = createNotionConnector({
    getToken: async () => "secret_test_token",
    getOAuthBasicHeader: () => "Basic test",
    fetch,
  });
  const ctx: SyncContext = {
    tenant_id: "t1",
    external_account_id: "acc-1",
    cursor,
    config,
  };
  const proposals: MemoryProposal[] = [];
  const checkpoints: (string | null)[] = [];
  for await (const ev of connector.sync(ctx)) {
    if (ev.kind === "proposal") proposals.push(ev.proposal);
    else if (ev.kind === "checkpoint") checkpoints.push(ev.cursor);
  }
  return { proposals, checkpoints, calls };
}

describe("sync — happy path", () => {
  it("emits one proposal per page (with rendered markdown body)", async () => {
    const page1 = makePage("page-a", { Name: titleProp("First") });
    const page2 = makePage("page-b", { Name: titleProp("Second"), type: selectProp("decision") });
    const routes: Record<string, RouteHandler> = {
      [SEARCH_URL]: ok({ object: "list", results: [page1, page2], has_more: false, next_cursor: null }),
      "https://api.notion.com/v1/blocks/page-a/children": ok({
        object: "list",
        results: [{ object: "block", id: "b1", type: "paragraph", has_children: false, paragraph: { rich_text: [{ plain_text: "Hello" }] } }],
        has_more: false,
        next_cursor: null,
      }),
      "https://api.notion.com/v1/blocks/page-b/children": ok({
        object: "list",
        results: [{ object: "block", id: "b2", type: "heading_1", has_children: false, heading_1: { rich_text: [{ plain_text: "Use Postgres" }] } }],
        has_more: false,
        next_cursor: null,
      }),
    };
    const { proposals } = await collectSync(routes);
    expect(proposals).toHaveLength(2);
    expect(proposals[0].type).toBe("note");
    expect(proposals[0].title).toBe("First");
    expect(proposals[0].body).toBe("Hello");
    expect(proposals[0].source_ref).toBe("notion:page-a");
    expect(proposals[1].type).toBe("decision");
    expect(proposals[1].body).toBe("# Use Postgres");
  });

  it("paginates search until has_more=false", async () => {
    let calls = 0;
    const routes: Record<string, RouteHandler> = {
      [SEARCH_URL]: (init) => {
        calls++;
        const body = init?.body ? JSON.parse(init.body) : {};
        if (calls === 1) {
          expect(body.start_cursor).toBeUndefined();
          return { ok: true, status: 200, body: { object: "list", results: [makePage("p1", { N: titleProp("1") })], has_more: true, next_cursor: "abc" } };
        }
        if (calls === 2) {
          expect(body.start_cursor).toBe("abc");
          return { ok: true, status: 200, body: { object: "list", results: [makePage("p2", { N: titleProp("2") })], has_more: false, next_cursor: null } };
        }
        return { ok: false, status: 500 };
      },
      "https://api.notion.com/v1/blocks/": ok({ object: "list", results: [], has_more: false, next_cursor: null }),
    };
    const { proposals } = await collectSync(routes);
    expect(proposals.map((p) => p.source_ref)).toEqual(["notion:p1", "notion:p2"]);
    expect(calls).toBe(2);
  });

  it("skips archived pages", async () => {
    const routes: Record<string, RouteHandler> = {
      [SEARCH_URL]: ok({
        object: "list",
        results: [
          makePage("alive", { N: titleProp("alive") }),
          makePage("ghost", { N: titleProp("ghost") }, { archived: true }),
        ],
        has_more: false,
        next_cursor: null,
      }),
      "https://api.notion.com/v1/blocks/alive/children": ok({ object: "list", results: [], has_more: false, next_cursor: null }),
    };
    const { proposals } = await collectSync(routes);
    expect(proposals.map((p) => p.source_ref)).toEqual(["notion:alive"]);
  });

  it("only checkpoints at search-response boundaries — codex-flagged [P1]", async () => {
    // Single search response with 8 pages, has_more=false. The earlier draft
    // checkpointed every 5 yields with cursor=next_cursor — on resume after
    // a mid-response crash, pages 6-8 would be skipped. Now: exactly ONE
    // checkpoint at the last item of the response, plus the terminal null.
    const results = Array.from({ length: 8 }, (_, i) => makePage(`p${i}`, { N: titleProp(`Title ${i}`) }));
    const routes: Record<string, RouteHandler> = {
      [SEARCH_URL]: ok({ object: "list", results, has_more: false, next_cursor: null }),
      "https://api.notion.com/v1/blocks/": ok({ object: "list", results: [], has_more: false, next_cursor: null }),
    };
    const { proposals, checkpoints } = await collectSync(routes);
    expect(proposals).toHaveLength(8);
    // 1 boundary checkpoint (last item of the only search response) + 1 final null.
    expect(checkpoints).toHaveLength(2);
    expect(checkpoints[0]).toBeNull(); // last item, no next page
    expect(checkpoints[1]).toBeNull(); // final terminal
  });

  it("checkpoint cursor at search-response boundary points to NEXT search page", async () => {
    // Two search responses. After the last page of response 1, the checkpoint
    // cursor must be the next_cursor of response 1 (so a resume re-enters at
    // response 2 — not at some mid-response position that doesn't exist).
    let calls = 0;
    const routes: Record<string, RouteHandler> = {
      [SEARCH_URL]: (init) => {
        calls++;
        const body = init?.body ? JSON.parse(init.body) : {};
        if (calls === 1) {
          return { ok: true, status: 200, body: { object: "list", results: [makePage("a", { N: titleProp("A") }), makePage("b", { N: titleProp("B") })], has_more: true, next_cursor: "cursor-2" } };
        }
        expect(body.start_cursor).toBe("cursor-2");
        return { ok: true, status: 200, body: { object: "list", results: [makePage("c", { N: titleProp("C") })], has_more: false, next_cursor: null } };
      },
      "https://api.notion.com/v1/blocks/": ok({ object: "list", results: [], has_more: false, next_cursor: null }),
    };
    const { checkpoints } = await collectSync(routes);
    // First boundary (after 'b'): cursor='cursor-2'. Second boundary (after 'c'): cursor=null. Final: null.
    expect(checkpoints).toEqual(["cursor-2", null, null]);
  });

  it("emits a final checkpoint with cursor=null when search drains", async () => {
    const routes: Record<string, RouteHandler> = {
      [SEARCH_URL]: ok({
        object: "list",
        results: [makePage("p1", { N: titleProp("x") })],
        has_more: false,
        next_cursor: null,
      }),
      "https://api.notion.com/v1/blocks/p1/children": ok({ object: "list", results: [], has_more: false, next_cursor: null }),
    };
    const { checkpoints } = await collectSync(routes);
    expect(checkpoints.at(-1)).toBeNull();
  });

  it("survives a block-fetch failure on a single page (metadata-only proposal)", async () => {
    const routes: Record<string, RouteHandler> = {
      [SEARCH_URL]: ok({
        object: "list",
        results: [makePage("p1", { N: titleProp("Title") })],
        has_more: false,
        next_cursor: null,
      }),
      "https://api.notion.com/v1/blocks/p1/children": () => ({ ok: false, status: 500, body: { message: "boom" } }),
    };
    const { proposals } = await collectSync(routes);
    expect(proposals).toHaveLength(1);
    expect(proposals[0].title).toBe("Title");
    expect(proposals[0].body).toBe("");
  });

  it("passes saved cursor on resume", async () => {
    let seenCursor: unknown = "missing";
    const routes: Record<string, RouteHandler> = {
      [SEARCH_URL]: (init) => {
        const b = init?.body ? JSON.parse(init.body) : {};
        seenCursor = b.start_cursor;
        return { ok: true, status: 200, body: { object: "list", results: [], has_more: false, next_cursor: null } };
      },
    };
    await collectSync(routes, "saved-cursor-42");
    expect(seenCursor).toBe("saved-cursor-42");
  });
});

// --------------------------------------------------------------------------
// Error classification
// --------------------------------------------------------------------------

describe("sync — error classification", () => {
  it("401 throws AuthExpiredError", async () => {
    const routes: Record<string, RouteHandler> = {
      [SEARCH_URL]: () => ({ ok: false, status: 401, body: { message: "Unauthorized" } }),
    };
    const { fetch } = mockFetch(routes);
    const connector = createNotionConnector({
      getToken: async () => "tok",
      getOAuthBasicHeader: () => "Basic test",
      fetch,
    });
    const iter = connector.sync({ tenant_id: "t1", external_account_id: "acc-1", cursor: null, config: {} });
    await expect((async () => {
      for await (const _e of iter) void _e;
    })()).rejects.toThrow(/auth_expired|notion 401/);
  });

  it("429 throws RateLimitError with retry-after honored", async () => {
    const routes: Record<string, RouteHandler> = {
      [SEARCH_URL]: () => ({ ok: false, status: 429, body: { message: "Rate limited" }, headers: { "retry-after": "30" } }),
    };
    const { fetch } = mockFetch(routes);
    const connector = createNotionConnector({
      getToken: async () => "tok",
      getOAuthBasicHeader: () => "Basic test",
      fetch,
    });
    const iter = connector.sync({ tenant_id: "t1", external_account_id: "acc-1", cursor: null, config: {} });
    await expect((async () => {
      for await (const _e of iter) void _e;
    })()).rejects.toThrow(/rate_limited/);
  });
});

// --------------------------------------------------------------------------
// preview hook
// --------------------------------------------------------------------------

describe("preview", () => {
  it("returns up to 10 sample proposals without fetching block bodies", async () => {
    const results = Array.from({ length: 15 }, (_, i) => makePage(`p${i}`, { N: titleProp(`Title ${i}`) }));
    const routes: Record<string, RouteHandler> = {
      [SEARCH_URL]: ok({ object: "list", results, has_more: false, next_cursor: null }),
    };
    const { fetch, calls } = mockFetch(routes);
    const connector = createNotionConnector({
      getToken: async () => "tok",
      getOAuthBasicHeader: () => "Basic test",
      fetch,
    });
    const preview = await connector.preview({
      tenant_id: "t1",
      external_account_id: "acc-1",
      cursor: null,
      config: {},
    });
    expect(preview).toHaveLength(10);
    expect(preview[0].source_ref).toBe("notion:p0");
    // No /blocks calls in preview (sample-only).
    expect(calls.every((c) => !c.url.includes("/blocks/"))).toBe(true);
  });
});
