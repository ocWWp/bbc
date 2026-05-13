// D-W5-2 tests for the Gmail connector.
//
// Per docs/plans/2026-05-12-bbc-launch-plan.md §3 / Week 5:
//   - threads → note; pinned (starred) threads → decision
//   - From/To headers → team (one-shot)
//   - source_ref includes thread permalink
//
// HTTP is mocked via GoogleFetch injection.

import { describe, expect, it } from "vitest";
import {
  createGmailConnector,
  parseConfig,
  splitAddressList,
  threadToProposals,
  type GmailConnectorDeps,
} from "./gmail";
import type { GoogleFetch } from "./google-oauth";
import type { MemoryProposal, SyncContext, SyncEvent } from "./framework";

// --------------------------------------------------------------------------
// Mock HTTP — dispatches on URL path so each test stays declarative.
// --------------------------------------------------------------------------

type Resp = { ok: boolean; status: number; body?: unknown; headers?: Record<string, string> };

function mockGmailFetch(
  routes: {
    threadList?: (url: URL) => Resp;
    threadGet?: (id: string, url: URL) => Resp;
    tokenRefresh?: () => Resp;
  },
): { fetch: GoogleFetch; calls: { url: string; method: string }[] } {
  const calls: { url: string; method: string }[] = [];
  const fetchImpl: GoogleFetch = async (url, init) => {
    calls.push({ url, method: init?.method ?? "GET" });
    const u = new URL(url);
    let r: Resp;
    if (u.host === "gmail.googleapis.com" && u.pathname.endsWith("/threads")) {
      r = routes.threadList ? routes.threadList(u) : { ok: false, status: 500 };
    } else if (u.host === "gmail.googleapis.com" && u.pathname.includes("/threads/")) {
      const id = decodeURIComponent(u.pathname.split("/threads/")[1] ?? "");
      r = routes.threadGet ? routes.threadGet(id, u) : { ok: false, status: 500 };
    } else if (u.host === "oauth2.googleapis.com") {
      r = routes.tokenRefresh ? routes.tokenRefresh() : { ok: false, status: 500 };
    } else {
      r = { ok: false, status: 404, body: "no route" };
    }
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

const okBody = (body: unknown): Resp => ({ ok: true, status: 200, body });

function baseDeps(fetchImpl: GoogleFetch, over: Partial<GmailConnectorDeps> = {}): GmailConnectorDeps {
  return {
    getToken: async () => "access_test",
    getRefreshToken: async () => "refresh_test",
    persistRefreshedToken: async () => undefined,
    getOAuthClientCredentials: () => ({ clientId: "cid", clientSecret: "csec" }),
    getRedirectUri: () => "https://bbc.example/oauth/google/callback",
    fetch: fetchImpl,
    ...over,
  };
}

function syncCtx(over: Partial<SyncContext> = {}): SyncContext {
  return {
    tenant_id: "t1",
    external_account_id: "ext_gmail",
    cursor: null,
    config: {},
    ...over,
  };
}

async function collect(it: AsyncIterable<SyncEvent>): Promise<SyncEvent[]> {
  const out: SyncEvent[] = [];
  for await (const ev of it) out.push(ev);
  return out;
}

function proposalsOf(events: SyncEvent[]): MemoryProposal[] {
  return events.flatMap((e) => (e.kind === "proposal" ? [e.proposal] : []));
}

// --------------------------------------------------------------------------
// Mapper (pure)
// --------------------------------------------------------------------------

describe("threadToProposals", () => {
  it("non-starred thread → note + team contacts from From/To/Cc", () => {
    const seen = new Set<string>();
    const props = threadToProposals(
      {
        id: "th1",
        messages: [
          {
            id: "m1",
            threadId: "th1",
            labelIds: ["INBOX"],
            snippet: "Hello world",
            internalDate: "1715587200000", // 2024-05-13
            payload: {
              headers: [
                { name: "From", value: '"Alice" <alice@example.com>' },
                { name: "To", value: "bob@example.com" },
                { name: "Cc", value: "carol@example.com, dan@example.com" },
                { name: "Subject", value: "Launch plan v3" },
                { name: "Date", value: "Mon, 13 May 2024 00:00:00 +0000" },
              ],
            },
          },
        ],
      },
      new Set(["STARRED"]),
      seen,
    );
    expect(props[0].type).toBe("note");
    expect(props[0].title).toBe("Launch plan v3");
    expect(props[0].source_ref).toBe("gmail:thread:th1");
    expect(props[0].fields.source_permalink).toContain("https://mail.google.com/mail/u/0/#inbox/th1");
    expect(props[0].body).toContain("Hello world");

    const teamRows = props.filter((p) => p.type === "team");
    expect(teamRows.map((p) => p.fields.email).sort()).toEqual([
      "alice@example.com",
      "bob@example.com",
      "carol@example.com",
      "dan@example.com",
    ]);
    expect(seen.has("alice@example.com")).toBe(true);
  });

  it("starred thread → decision", () => {
    const props = threadToProposals(
      {
        id: "th2",
        messages: [
          {
            id: "m2",
            threadId: "th2",
            labelIds: ["INBOX", "STARRED"],
            snippet: "Decided to go with OpenNext",
            internalDate: "1715673600000",
            payload: { headers: [{ name: "Subject", value: "Decision: build runtime" }] },
          },
        ],
      },
      new Set(["STARRED"]),
      new Set(),
    );
    expect(props[0].type).toBe("decision");
    expect(props[0].fields).toMatchObject({
      decision: "Decision: build runtime",
      source_kind: "gmail_thread",
    });
    expect(props[0].fields.decided_on).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("custom decision label is honored", () => {
    const props = threadToProposals(
      {
        id: "th3",
        messages: [
          {
            id: "m3",
            threadId: "th3",
            labelIds: ["Label_BBC_ADR"],
            snippet: "Custom-label decision",
            internalDate: "1715673600000",
            payload: { headers: [{ name: "Subject", value: "Custom label" }] },
          },
        ],
      },
      new Set(["Label_BBC_ADR"]),
      new Set(),
    );
    expect(props[0].type).toBe("decision");
  });

  it("falls back to '(no subject)' when subject is missing", () => {
    const props = threadToProposals(
      {
        id: "th4",
        messages: [
          { id: "m4", threadId: "th4", labelIds: [], snippet: "", payload: { headers: [] } },
        ],
      },
      new Set(["STARRED"]),
      new Set(),
    );
    expect(props[0].title).toBe("(no subject)");
  });

  it("seenContacts dedupes across messages in the same thread", () => {
    const seen = new Set<string>();
    const props = threadToProposals(
      {
        id: "th5",
        messages: [
          {
            id: "m5a",
            threadId: "th5",
            payload: { headers: [{ name: "From", value: "alice@example.com" }] },
          },
          {
            id: "m5b",
            threadId: "th5",
            payload: { headers: [{ name: "From", value: "Alice <alice@example.com>" }] },
          },
        ],
      },
      new Set(),
      seen,
    );
    const teamRows = props.filter((p) => p.type === "team");
    expect(teamRows.length).toBe(1);
  });
});

describe("splitAddressList", () => {
  it("parses comma-separated headers with optional display names", () => {
    expect(splitAddressList('"Alice" <alice@example.com>, bob@example.com')).toEqual([
      { email: "alice@example.com", name: "Alice" },
      { email: "bob@example.com", name: null },
    ]);
  });

  it("ignores entries without an @", () => {
    expect(splitAddressList("not-an-email, ok@example.com")).toEqual([
      { email: "ok@example.com", name: null },
    ]);
  });
});

// --------------------------------------------------------------------------
// Config + manifest
// --------------------------------------------------------------------------

describe("parseConfig", () => {
  it("uses sensible defaults", () => {
    const cfg = parseConfig({});
    expect(cfg.query).toBe("in:inbox newer_than:30d");
    expect(cfg.decision_labels).toEqual(["STARRED"]);
    expect(cfg.thread_limit).toBe(200);
  });

  it("accepts user-supplied query + labels + limit", () => {
    const cfg = parseConfig({
      query: "label:bbc",
      decision_labels: ["BBC_ADR", "STARRED"],
      thread_limit: 50,
    });
    expect(cfg.query).toBe("label:bbc");
    expect(cfg.decision_labels).toEqual(["BBC_ADR", "STARRED"]);
    expect(cfg.thread_limit).toBe(50);
  });

  it("caps thread_limit at 1000", () => {
    expect(parseConfig({ thread_limit: 99_999 }).thread_limit).toBe(1_000);
  });
});

describe("connector manifest", () => {
  it("writes_to matches what the mapper emits", () => {
    const { fetch } = mockGmailFetch({});
    const c = createGmailConnector(baseDeps(fetch));
    expect(c.writes_to.sort()).toEqual(["decision", "note", "team"]);
  });
});

// --------------------------------------------------------------------------
// Authenticate
// --------------------------------------------------------------------------

describe("authenticate", () => {
  it("builds a Google OAuth URL scoped to gmail.readonly", async () => {
    const { fetch } = mockGmailFetch({});
    const c = createGmailConnector(baseDeps(fetch));
    const { url, state } = await c.authenticate("t1", "https://bbc.example/cb");
    const u = new URL(url);
    expect(u.origin + u.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(u.searchParams.get("client_id")).toBe("cid");
    expect(u.searchParams.get("redirect_uri")).toBe("https://bbc.example/cb");
    expect(u.searchParams.get("scope")).toBe("https://www.googleapis.com/auth/gmail.readonly");
    expect(u.searchParams.get("access_type")).toBe("offline");
    expect(u.searchParams.get("state")).toBe(state);
    expect(state).toContain("provider=gmail");
  });
});

// --------------------------------------------------------------------------
// Refresh
// --------------------------------------------------------------------------

describe("refresh_token", () => {
  it("calls google's token endpoint and persists the new access token", async () => {
    let persisted: { access_token: string; expires_in: number } | null = null;
    const { fetch, calls } = mockGmailFetch({
      tokenRefresh: () => okBody({ access_token: "new_at", expires_in: 3599, token_type: "Bearer", scope: "https://www.googleapis.com/auth/gmail.readonly" }),
    });
    const c = createGmailConnector(
      baseDeps(fetch, {
        persistRefreshedToken: async (_id, tokens) => {
          persisted = tokens;
        },
      }),
    );
    await c.refresh_token!("ext_gmail");
    expect(persisted).toEqual({ access_token: "new_at", expires_in: 3599 });
    expect(calls.some((c) => c.url.includes("oauth2.googleapis.com/token") && c.method === "POST")).toBe(true);
  });
});

// --------------------------------------------------------------------------
// Sync
// --------------------------------------------------------------------------

describe("sync", () => {
  it("walks threads.list → threads.get and emits typed proposals", async () => {
    const threadById: Record<string, unknown> = {
      th1: {
        id: "th1",
        messages: [
          {
            id: "m1",
            threadId: "th1",
            labelIds: ["INBOX"],
            snippet: "hello",
            internalDate: "1715587200000",
            payload: { headers: [{ name: "From", value: "alice@example.com" }, { name: "Subject", value: "Hello" }] },
          },
        ],
      },
      th2: {
        id: "th2",
        messages: [
          {
            id: "m2",
            threadId: "th2",
            labelIds: ["INBOX", "STARRED"],
            snippet: "pinned",
            internalDate: "1715673600000",
            payload: { headers: [{ name: "From", value: "bob@example.com" }, { name: "Subject", value: "Pinned topic" }] },
          },
        ],
      },
    };
    const { fetch } = mockGmailFetch({
      threadList: () => okBody({ threads: [{ id: "th1" }, { id: "th2" }] }),
      threadGet: (id) => okBody(threadById[id]),
    });
    const c = createGmailConnector(baseDeps(fetch));

    const events = await collect(c.sync(syncCtx()));
    const props = proposalsOf(events);
    const byRef = Object.fromEntries(props.map((p) => [p.source_ref, p]));
    expect(byRef["gmail:thread:th1"].type).toBe("note");
    expect(byRef["gmail:thread:th2"].type).toBe("decision");
    expect(byRef["gmail:contact:alice@example.com"].type).toBe("team");
    expect(byRef["gmail:contact:bob@example.com"].type).toBe("team");

    const checkpoints = events.filter((e) => e.kind === "checkpoint");
    const last = checkpoints[checkpoints.length - 1];
    expect(last.kind === "checkpoint" && last.cursor).toContain('"phase":"done"');
  });

  it("checkpoint includes nextPageToken when Gmail has more pages", async () => {
    let page = 0;
    const { fetch } = mockGmailFetch({
      threadList: () => {
        page++;
        if (page === 1) return okBody({ threads: [{ id: "th1" }], nextPageToken: "page2" });
        return okBody({ threads: [{ id: "th2" }] });
      },
      threadGet: (id) =>
        okBody({
          id,
          messages: [
            { id: `m_${id}`, threadId: id, labelIds: [], payload: { headers: [{ name: "Subject", value: `t-${id}` }] } },
          ],
        }),
    });
    const c = createGmailConnector(baseDeps(fetch));
    const events = await collect(c.sync(syncCtx()));
    const checkpoints = events.filter((e): e is Extract<SyncEvent, { kind: "checkpoint" }> => e.kind === "checkpoint").map((e) => e.cursor);
    // Mid-sweep checkpoint should carry pageToken="page2".
    expect(checkpoints.some((c) => typeof c === "string" && c.includes("page2"))).toBe(true);
  });

  it("resuming from { phase: 'threads', pageToken } sends pageToken on the first list call", async () => {
    let observed: string | null = null;
    const { fetch } = mockGmailFetch({
      threadList: (url) => {
        observed = url.searchParams.get("pageToken");
        return okBody({ threads: [] });
      },
    });
    const c = createGmailConnector(baseDeps(fetch));
    await collect(c.sync(syncCtx({ cursor: JSON.stringify({ phase: "threads", pageToken: "resume_token" }) })));
    expect(observed).toBe("resume_token");
  });

  it("'done' cursor triggers a fresh sweep (pageToken is null on first call)", async () => {
    let observed: string | null = "not-called";
    const { fetch } = mockGmailFetch({
      threadList: (url) => {
        observed = url.searchParams.get("pageToken");
        return okBody({ threads: [] });
      },
    });
    const c = createGmailConnector(baseDeps(fetch));
    await collect(c.sync(syncCtx({ cursor: JSON.stringify({ phase: "done", pageToken: null }) })));
    expect(observed).toBeNull();
  });

  it("maps 401 from threads.list to AuthExpiredError", async () => {
    const { fetch } = mockGmailFetch({
      threadList: () => ({ ok: false, status: 401, body: { error: { message: "auth" } } }),
    });
    const c = createGmailConnector(baseDeps(fetch));
    await expect(collect(c.sync(syncCtx()))).rejects.toMatchObject({ name: "AuthExpiredError" });
  });

  it("maps 429 to RateLimitError carrying retry-after", async () => {
    const { fetch } = mockGmailFetch({
      threadList: () => ({ ok: false, status: 429, body: "rate limited", headers: { "retry-after": "7" } }),
    });
    const c = createGmailConnector(baseDeps(fetch));
    const err = await collect(c.sync(syncCtx())).catch((e) => e);
    expect(err.name).toBe("RateLimitError");
    expect((err as { retry_after_ms?: number }).retry_after_ms).toBe(7_000);
  });
});
