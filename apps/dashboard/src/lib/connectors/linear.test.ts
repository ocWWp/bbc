// D-W4-1 tests for the Linear connector.
//
// Per docs/plans/2026-05-12-bbc-launch-plan.md §3 / Week 4:
//   - cycle issues land as proposals; preview renders
//   - mapping: projects+cycles → product, issues with adr label → decision,
//     other issues → note
//
// HTTP is mocked via LinearFetch injection.

import { describe, expect, it } from "vitest";
import {
  createLinearConnector,
  cycleToProposal,
  issueToProposal,
  parseConfig,
  projectToProposal,
  type LinearConnectorDeps,
  type LinearFetch,
} from "./linear";
import type { MemoryProposal, SyncContext, SyncEvent } from "./framework";

// --------------------------------------------------------------------------
// Mock HTTP
// --------------------------------------------------------------------------

type Resp = { ok: boolean; status: number; body?: unknown; headers?: Record<string, string> };

type GraphQLHandler = (variables: Record<string, unknown>) => Resp;

/** Mock graphql endpoint that dispatches on the first non-whitespace token of
 *  the query body — "Projects" / "Cycles" / "Issues" — keeping tests readable
 *  while still exercising the real { query, variables } POST shape. */
function mockLinearFetch(handlers: Record<string, GraphQLHandler>): { fetch: LinearFetch; calls: { op: string; variables: Record<string, unknown> }[] } {
  const calls: { op: string; variables: Record<string, unknown> }[] = [];
  const fetchImpl: LinearFetch = async (url, init) => {
    if (!url.includes("api.linear.app/graphql")) {
      return { ok: false, status: 404, json: async () => ({}), text: async () => "no route", headers: { get: () => null } };
    }
    const parsed = JSON.parse(init?.body ?? "{}") as { query: string; variables: Record<string, unknown> };
    const op = (parsed.query.match(/query\s+(\w+)/)?.[1] ?? "unknown").toLowerCase();
    calls.push({ op, variables: parsed.variables });
    const handler = handlers[op];
    if (!handler) {
      return {
        ok: false,
        status: 500,
        json: async () => ({ errors: [{ message: `no handler for ${op}` }] }),
        text: async () => `no handler for ${op}`,
        headers: { get: () => null },
      };
    }
    const r = handler(parsed.variables);
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

const okData = (data: unknown): Resp => ({ ok: true, status: 200, body: { data } });

function baseDeps(fetchImpl: LinearFetch): LinearConnectorDeps {
  return {
    getToken: async () => "linear_test_token",
    getOAuthClientCredentials: () => ({ clientId: "client_test", clientSecret: "secret_test" }),
    fetch: fetchImpl,
  };
}

function syncCtx(over: Partial<SyncContext> = {}): SyncContext {
  return {
    tenant_id: "t1",
    external_account_id: "ext_1",
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

function proposals(events: SyncEvent[]): MemoryProposal[] {
  return events.flatMap((e) => (e.kind === "proposal" ? [e.proposal] : []));
}

// --------------------------------------------------------------------------
// Mappers (pure)
// --------------------------------------------------------------------------

describe("projectToProposal", () => {
  it("maps a project to a product row with permalink + dates", () => {
    const p = projectToProposal({
      id: "p1",
      name: "Launch BBC",
      description: "Ship the OSS dashboard.",
      state: "started",
      url: "https://linear.app/acme/project/p1",
      startDate: "2026-05-01",
      targetDate: "2026-07-01",
    });
    expect(p.type).toBe("product");
    expect(p.title).toBe("Launch BBC");
    expect(p.source_ref).toBe("linear:project:p1");
    expect(p.fields).toMatchObject({
      name: "Launch BBC",
      status: "started",
      source_permalink: "https://linear.app/acme/project/p1",
      source_kind: "linear_project",
    });
    expect(p.body).toContain("Ship the OSS dashboard.");
    expect(p.body).toContain("2026-05-01");
    expect(p.body).toContain("2026-07-01");
  });

  it("falls back to 'Untitled project' when name is empty", () => {
    const p = projectToProposal({
      id: "p2",
      name: "",
      description: null,
      state: null,
      url: "https://linear.app/acme/project/p2",
      startDate: null,
      targetDate: null,
    });
    expect(p.title).toBe("Untitled project");
    expect(p.fields.status).toBe("active");
  });
});

describe("cycleToProposal", () => {
  it("maps a cycle to a product row with team prefix", () => {
    const c = cycleToProposal({
      id: "c1",
      name: "Sprint 12",
      number: 12,
      startsAt: "2026-05-01T00:00:00.000Z",
      endsAt: "2026-05-14T23:59:59.000Z",
      team: { id: "tm1", name: "Platform" },
    });
    expect(c.type).toBe("product");
    expect(c.title).toBe("Platform · Sprint 12");
    expect(c.body).toContain("2026-05-01");
    expect(c.source_ref).toBe("linear:cycle:c1");
  });

  it("synthesizes a name from the cycle number when name is missing", () => {
    const c = cycleToProposal({
      id: "c2",
      name: null,
      number: 7,
      startsAt: "2026-04-01T00:00:00.000Z",
      endsAt: "2026-04-14T00:00:00.000Z",
      team: null,
    });
    expect(c.title).toBe("Cycle 7");
  });
});

describe("issueToProposal", () => {
  const labels = new Set(["adr"]);

  it("issue without `adr` label maps to note", () => {
    const p = issueToProposal({
      id: "i1",
      identifier: "BBC-42",
      title: "Wire dashboard nav",
      description: "Adds the top-tab",
      url: "https://linear.app/acme/issue/BBC-42",
      updatedAt: "2026-05-10T12:00:00.000Z",
      labels: { nodes: [{ name: "frontend" }] },
      team: { key: "BBC", name: "BBC" },
      project: null,
    }, labels);
    expect(p.type).toBe("note");
    expect(p.title).toBe("BBC-42: Wire dashboard nav");
    expect(p.body).toContain("Adds the top-tab");
    expect(p.body).toContain("2026-05-10");
    expect(p.source_ref).toBe("linear:issue:i1");
  });

  it("issue with `adr` label (case-insensitive) maps to decision", () => {
    const p = issueToProposal({
      id: "i2",
      identifier: "BBC-43",
      title: "Adopt OpenNext for Cloudflare",
      description: "Trade-offs vs. native Worker handlers.",
      url: "https://linear.app/acme/issue/BBC-43",
      updatedAt: "2026-05-11T08:00:00.000Z",
      labels: { nodes: [{ name: "ADR" }, { name: "p1" }] },
      team: { key: "BBC", name: "BBC" },
      project: null,
    }, labels);
    expect(p.type).toBe("decision");
    expect(p.fields).toMatchObject({
      decision: "Adopt OpenNext for Cloudflare",
      decided_on: "2026-05-11",
      source_kind: "linear_issue",
    });
  });

  it("handles missing description", () => {
    const p = issueToProposal({
      id: "i3",
      identifier: "BBC-1",
      title: "Bare issue",
      description: null,
      url: "https://linear.app/acme/issue/BBC-1",
      updatedAt: "2026-05-12T00:00:00.000Z",
      labels: { nodes: [] },
      team: null,
      project: null,
    }, labels);
    expect(p.type).toBe("note");
    expect(p.body).not.toContain("null");
  });
});

// --------------------------------------------------------------------------
// Config + manifest contract
// --------------------------------------------------------------------------

describe("parseConfig", () => {
  it("uses sensible defaults", () => {
    const cfg = parseConfig({});
    expect(cfg.decision_labels).toEqual(["adr"]);
    expect(cfg.issue_limit).toBe(300);
  });

  it("accepts user-supplied label list", () => {
    const cfg = parseConfig({ decision_labels: ["ADR", "north-star"] });
    expect(cfg.decision_labels).toEqual(["ADR", "north-star"]);
  });

  it("caps issue_limit at 1000", () => {
    const cfg = parseConfig({ issue_limit: 99_999 });
    expect(cfg.issue_limit).toBe(1_000);
  });
});

describe("connector manifest", () => {
  it("writes_to contains only types the mapper emits", () => {
    const c = createLinearConnector(baseDeps(mockLinearFetch({}).fetch));
    expect(c.writes_to.sort()).toEqual(["decision", "note", "product"]);
  });
});

// --------------------------------------------------------------------------
// Authenticate (OAuth URL shape)
// --------------------------------------------------------------------------

describe("authenticate", () => {
  it("builds a Linear OAuth authorize URL with state + actor=user", async () => {
    const c = createLinearConnector(baseDeps(mockLinearFetch({}).fetch));
    const { url, state } = await c.authenticate("t1", "https://bbc.example/oauth/callback");
    const u = new URL(url);
    expect(u.origin + u.pathname).toBe("https://linear.app/oauth/authorize");
    expect(u.searchParams.get("client_id")).toBe("client_test");
    expect(u.searchParams.get("redirect_uri")).toBe("https://bbc.example/oauth/callback");
    expect(u.searchParams.get("response_type")).toBe("code");
    expect(u.searchParams.get("scope")).toBe("read");
    expect(u.searchParams.get("actor")).toBe("user");
    expect(u.searchParams.get("state")).toBe(state);
    expect(state).toContain("tenant=t1");
  });
});

// --------------------------------------------------------------------------
// Sync orchestration
// --------------------------------------------------------------------------

describe("sync", () => {
  it("walks projects → cycles → issues and emits a checkpoint per phase", async () => {
    const handlers: Record<string, GraphQLHandler> = {
      projects: () =>
        okData({
          projects: {
            nodes: [
              { id: "p1", name: "Launch", description: "x", state: "started", url: "https://linear.app/x/p1", startDate: null, targetDate: null },
            ],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        }),
      cycles: () =>
        okData({
          cycles: {
            nodes: [
              { id: "c1", name: "Sprint 1", number: 1, startsAt: "2026-05-01T00:00:00Z", endsAt: "2026-05-14T00:00:00Z", team: { id: "tm", name: "Platform" } },
            ],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        }),
      issues: () =>
        okData({
          issues: {
            nodes: [
              { id: "i1", identifier: "BBC-1", title: "first", description: null, url: "https://linear.app/x/i1", updatedAt: "2026-05-12T00:00:00Z", labels: { nodes: [] }, team: null, project: null },
              { id: "i2", identifier: "BBC-2", title: "decided", description: null, url: "https://linear.app/x/i2", updatedAt: "2026-05-12T00:00:00Z", labels: { nodes: [{ name: "adr" }] }, team: null, project: null },
            ],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        }),
    };
    const { fetch: f, calls } = mockLinearFetch(handlers);
    const c = createLinearConnector(baseDeps(f));

    const events = await collect(c.sync(syncCtx()));
    const props = proposals(events);
    expect(props.map((p) => `${p.type}:${p.source_ref}`)).toEqual([
      "product:linear:project:p1",
      "product:linear:cycle:c1",
      "note:linear:issue:i1",
      "decision:linear:issue:i2",
    ]);

    const checkpoints = events.filter((e) => e.kind === "checkpoint");
    expect(checkpoints.length).toBeGreaterThanOrEqual(3);
    const finalCheckpoint = checkpoints[checkpoints.length - 1];
    expect(finalCheckpoint.kind === "checkpoint" && finalCheckpoint.cursor).toContain('"phase":"done"');

    // Sanity: we did call all three GraphQL ops.
    expect(calls.map((c) => c.op).sort()).toEqual(["cycles", "issues", "projects"]);
  });

  it("resuming from a cycles cursor skips the projects phase", async () => {
    let projectsCalled = false;
    const handlers: Record<string, GraphQLHandler> = {
      projects: () => {
        projectsCalled = true;
        return okData({ projects: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } } });
      },
      cycles: () => okData({ cycles: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } } }),
      issues: () => okData({ issues: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } } }),
    };
    const { fetch: f } = mockLinearFetch(handlers);
    const c = createLinearConnector(baseDeps(f));

    await collect(
      c.sync(
        syncCtx({
          cursor: JSON.stringify({ phase: "cycles", endCursor: null }),
        }),
      ),
    );
    expect(projectsCalled).toBe(false);
  });

  it("re-emits proposals on a done cursor (fresh sweep)", async () => {
    const handlers: Record<string, GraphQLHandler> = {
      projects: () =>
        okData({
          projects: {
            nodes: [
              { id: "p1", name: "Launch", description: null, state: null, url: "u", startDate: null, targetDate: null },
            ],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        }),
      cycles: () => okData({ cycles: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } } }),
      issues: () => okData({ issues: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } } }),
    };
    const { fetch: f } = mockLinearFetch(handlers);
    const c = createLinearConnector(baseDeps(f));

    const events = await collect(
      c.sync(syncCtx({ cursor: JSON.stringify({ phase: "done", endCursor: null }) })),
    );
    const props = proposals(events);
    expect(props.find((p) => p.source_ref === "linear:project:p1")).toBeDefined();
  });

  it("maps GraphQL authentication errors to AuthExpiredError", async () => {
    const handlers: Record<string, GraphQLHandler> = {
      projects: () => ({ ok: true, status: 200, body: { errors: [{ message: "AUTHENTICATION required" }] } }),
    };
    const { fetch: f } = mockLinearFetch(handlers);
    const c = createLinearConnector(baseDeps(f));
    await expect(collect(c.sync(syncCtx()))).rejects.toMatchObject({ name: "AuthExpiredError" });
  });

  it("maps a 429 response to RateLimitError carrying retry-after", async () => {
    const handlers: Record<string, GraphQLHandler> = {
      projects: () => ({ ok: false, status: 429, body: { errors: [{ message: "rate limited" }] }, headers: { "retry-after": "12" } }),
    };
    const { fetch: f } = mockLinearFetch(handlers);
    const c = createLinearConnector(baseDeps(f));
    const err = await collect(c.sync(syncCtx())).catch((e) => e);
    expect(err.name).toBe("RateLimitError");
    // RateLimitError.retry_after_ms is set when retry-after is parseable.
    expect((err as { retry_after_ms?: number }).retry_after_ms).toBe(12_000);
  });

  it("checkpoints inside the issues phase at PAGE_SIZE boundaries", async () => {
    let page = 0;
    const handlers: Record<string, GraphQLHandler> = {
      projects: () => okData({ projects: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } } }),
      cycles: () => okData({ cycles: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } } }),
      issues: () => {
        page++;
        if (page === 1) {
          // 50 issues, more pages remain.
          return okData({
            issues: {
              nodes: Array.from({ length: 50 }, (_, i) => ({
                id: `i${i}`,
                identifier: `BBC-${i}`,
                title: `t${i}`,
                description: null,
                url: `u${i}`,
                updatedAt: "2026-05-12T00:00:00Z",
                labels: { nodes: [] },
                team: null,
                project: null,
              })),
              pageInfo: { hasNextPage: true, endCursor: "page1_end" },
            },
          });
        }
        // Drain.
        return okData({ issues: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } } });
      },
    };
    const { fetch: f } = mockLinearFetch(handlers);
    const c = createLinearConnector(baseDeps(f));
    const events = await collect(c.sync(syncCtx()));
    const issueCheckpoints = events.filter(
      (e) => e.kind === "checkpoint" && e.cursor != null && e.cursor.includes('"phase":"issues"') && e.cursor.includes("page1_end"),
    );
    expect(issueCheckpoints.length).toBeGreaterThanOrEqual(1);
  });
});
