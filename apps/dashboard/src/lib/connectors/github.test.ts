// D-W3-3 acceptance tests for the GitHub PAT connector.
//
// Per docs/plans/2026-05-12-bbc-launch-plan.md §3 / Week 3:
//   - ADRs surface as decisions
//   - PRs as notes (SHA = source_ref)
//   - Re-sync no dupes (covered by framework dedup; here we verify source_ref shape)
//
// The HTTP layer is mocked end-to-end.

import { describe, expect, it } from "vitest";
import { createGithubConnector, parseConfig, type GithubFetch } from "./github";
import { runSync, type ConnectorDb, type MemoryProposal } from "./framework";

// --------------------------------------------------------------------------
// Mock HTTP — a router keyed on URL prefix.
// --------------------------------------------------------------------------

type Routes = Record<string, () => Response>;

type Response = {
  ok: boolean;
  status: number;
  body?: unknown;
  text?: string;
  headers?: Record<string, string>;
};

function mockFetch(routes: Routes): { fetch: GithubFetch; calls: string[] } {
  const calls: string[] = [];
  const fetchImpl: GithubFetch = async (url) => {
    calls.push(url);
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
    const r = routes[matched]();
    return {
      ok: r.ok,
      status: r.status,
      json: async () => r.body,
      text: async () => r.text ?? (typeof r.body === "string" ? r.body : JSON.stringify(r.body)),
      headers: { get: (n: string) => r.headers?.[n.toLowerCase()] ?? null },
    };
  };
  return { fetch: fetchImpl, calls };
}

function jsonRoute(body: unknown, headers: Record<string, string> = {}): () => Response {
  return () => ({ ok: true, status: 200, body, headers });
}

function textRoute(text: string): () => Response {
  return () => ({ ok: true, status: 200, body: text, text, headers: { "content-type": "text/plain" } });
}

function notFound(): () => Response {
  return () => ({ ok: false, status: 404, body: { message: "Not Found" } });
}

// --------------------------------------------------------------------------
// Driver: bypass runSync and iterate the connector directly, collecting
// proposals + checkpoints. Simpler than full runSync wiring for unit tests.
// --------------------------------------------------------------------------

async function collectSync(
  fetchImpl: GithubFetch,
  cfg: Record<string, unknown>,
  pat = "ghp_test",
  cursor: string | null = null,
): Promise<{ proposals: MemoryProposal[]; checkpoints: string[] }> {
  const connector = createGithubConnector({
    getToken: async () => pat,
    fetch: fetchImpl,
  });
  const proposals: MemoryProposal[] = [];
  const checkpoints: string[] = [];
  for await (const ev of connector.sync({
    tenant_id: "t1",
    external_account_id: "acc-1",
    cursor,
    config: cfg,
  })) {
    if (ev.kind === "proposal") proposals.push(ev.proposal);
    else if (ev.kind === "checkpoint") checkpoints.push(ev.cursor ?? "");
  }
  return { proposals, checkpoints };
}

// --------------------------------------------------------------------------
// 1. parseConfig
// --------------------------------------------------------------------------

describe("parseConfig", () => {
  it("requires owner + repo", () => {
    expect(() => parseConfig({})).toThrow(/owner, repo/);
    expect(() => parseConfig({ owner: "ZethT" })).toThrow(/owner, repo/);
  });

  it("fills sensible defaults", () => {
    const c = parseConfig({ owner: "ZethT", repo: "bbc" });
    expect(c.decision_paths).toEqual(["docs/decisions", "docs/adr"]);
    expect(c.include_prs).toBe(true);
    expect(c.include_collaborators).toBe(true);
    expect(c.pr_state).toBe("closed");
  });

  it("respects user overrides", () => {
    const c = parseConfig({
      owner: "ZethT",
      repo: "bbc",
      decision_paths: ["docs/decisions"],
      include_prs: false,
      include_collaborators: false,
      pr_state: "all",
    });
    expect(c.decision_paths).toEqual(["docs/decisions"]);
    expect(c.include_prs).toBe(false);
    expect(c.include_collaborators).toBe(false);
    expect(c.pr_state).toBe("all");
  });

  it("ignores blank entries in decision_paths", () => {
    const c = parseConfig({ owner: "x", repo: "y", decision_paths: ["", "  ", "docs/decisions"] });
    expect(c.decision_paths).toEqual(["docs/decisions"]);
  });
});

// --------------------------------------------------------------------------
// 2. Markdown files → decision proposals
// --------------------------------------------------------------------------

describe("sync — decisions", () => {
  it("emits one decision per markdown file in decision_paths", async () => {
    const { fetch } = mockFetch({
      "https://api.github.com/repos/ZethT/bbc/contents/docs/decisions": jsonRoute([
        {
          type: "file",
          name: "0001-foo.md",
          path: "docs/decisions/0001-foo.md",
          sha: "abc",
          download_url: "https://raw/0001",
        },
        { type: "file", name: "0002-bar.md", path: "docs/decisions/0002-bar.md", sha: "def", download_url: "https://raw/0002" },
        { type: "file", name: "README.txt", path: "docs/decisions/README.txt", sha: "ghi", download_url: "https://raw/README" },
      ]),
      "https://api.github.com/repos/ZethT/bbc/contents/docs/adr": notFound(),
      "https://raw/0001": textRoute("# Use Postgres\n\nWe decided on Postgres because…"),
      "https://raw/0002": textRoute("# Stop using Redis\n\nReasons…"),
      "https://api.github.com/repos/ZethT/bbc/pulls": jsonRoute([]),
      "https://api.github.com/repos/ZethT/bbc/collaborators": jsonRoute([]),
    });

    const { proposals } = await collectSync(fetch, {
      owner: "ZethT",
      repo: "bbc",
      include_prs: false,
      include_collaborators: false,
    });

    expect(proposals).toHaveLength(2);
    expect(proposals.map((p) => p.type)).toEqual(["decision", "decision"]);
    expect(proposals[0].title).toBe("Use Postgres");
    expect(proposals[0].source_ref).toBe("github:ZethT/bbc:file:docs/decisions/0001-foo.md");
    expect(proposals[0].fields.source_permalink).toContain("blob/HEAD/docs/decisions/0001-foo.md");
    expect(proposals[1].title).toBe("Stop using Redis");
    // README.txt was filtered (not .md)
  });

  it("derives title from filename when body has no H1", async () => {
    const { fetch } = mockFetch({
      "https://api.github.com/repos/ZethT/bbc/contents/docs/decisions": jsonRoute([
        { type: "file", name: "0042-no-h1.md", path: "docs/decisions/0042-no-h1.md", sha: "x", download_url: "https://raw/x" },
      ]),
      "https://api.github.com/repos/ZethT/bbc/contents/docs/adr": notFound(),
      "https://raw/x": textRoute("No heading here. Just prose."),
      "https://api.github.com/repos/ZethT/bbc/pulls": jsonRoute([]),
      "https://api.github.com/repos/ZethT/bbc/collaborators": jsonRoute([]),
    });

    const { proposals } = await collectSync(fetch, { owner: "ZethT", repo: "bbc" });
    expect(proposals[0].title).toBe("0042 no h1");
  });

  it("404 on a configured decision_path is non-fatal", async () => {
    const { fetch } = mockFetch({
      "https://api.github.com/repos/ZethT/bbc/contents/docs/decisions": notFound(),
      "https://api.github.com/repos/ZethT/bbc/contents/docs/adr": notFound(),
      "https://api.github.com/repos/ZethT/bbc/pulls": jsonRoute([]),
      "https://api.github.com/repos/ZethT/bbc/collaborators": jsonRoute([]),
    });
    const { proposals, checkpoints } = await collectSync(fetch, { owner: "ZethT", repo: "bbc" });
    expect(proposals).toHaveLength(0);
    // We still produced phase-transition checkpoints.
    expect(checkpoints.length).toBeGreaterThan(0);
  });
});

// --------------------------------------------------------------------------
// 3. PRs → note proposals
// --------------------------------------------------------------------------

describe("sync — PRs", () => {
  const baseDecisions = {
    "https://api.github.com/repos/ZethT/bbc/contents/docs/decisions": notFound(),
    "https://api.github.com/repos/ZethT/bbc/contents/docs/adr": notFound(),
  } as Routes;

  it("emits one note per merged PR with SHA as source_ref", async () => {
    const { fetch } = mockFetch({
      ...baseDecisions,
      "https://api.github.com/repos/ZethT/bbc/pulls": jsonRoute([
        {
          number: 123,
          title: "Add billing",
          body: "Adds Stripe.",
          merge_commit_sha: "deadbeef",
          merged_at: "2026-05-01T00:00:00Z",
          html_url: "https://github.com/ZethT/bbc/pull/123",
          user: { login: "alice" },
        },
        {
          number: 124,
          title: "Closed without merge",
          body: null,
          merge_commit_sha: null,
          merged_at: null,
          html_url: "https://github.com/ZethT/bbc/pull/124",
          user: { login: "bob" },
        },
      ]),
      "https://api.github.com/repos/ZethT/bbc/collaborators": jsonRoute([]),
    });

    const { proposals } = await collectSync(fetch, {
      owner: "ZethT",
      repo: "bbc",
      include_collaborators: false,
    });

    // Only the merged PR survives.
    expect(proposals).toHaveLength(1);
    expect(proposals[0].type).toBe("note");
    expect(proposals[0].title).toBe("PR #123: Add billing");
    expect(proposals[0].source_ref).toBe("github:ZethT/bbc:pr:deadbeef");
    expect(proposals[0].fields.source_permalink).toBe("https://github.com/ZethT/bbc/pull/123");
    expect(proposals[0].body).toContain("Adds Stripe.");
    expect(proposals[0].body).toContain("@alice");
  });
});

// --------------------------------------------------------------------------
// 4. Collaborators → team proposals
// --------------------------------------------------------------------------

describe("sync — collaborators", () => {
  it("emits one team proposal per User-type collaborator", async () => {
    const { fetch } = mockFetch({
      "https://api.github.com/repos/ZethT/bbc/contents/docs/decisions": notFound(),
      "https://api.github.com/repos/ZethT/bbc/contents/docs/adr": notFound(),
      "https://api.github.com/repos/ZethT/bbc/pulls": jsonRoute([]),
      "https://api.github.com/repos/ZethT/bbc/collaborators": jsonRoute([
        { login: "alice", html_url: "https://github.com/alice", type: "User", role_name: "admin" },
        { login: "bbc-bot", html_url: "https://github.com/bbc-bot", type: "Bot" },
        { login: "charlie", html_url: "https://github.com/charlie", type: "User" },
      ]),
    });

    const { proposals } = await collectSync(fetch, { owner: "ZethT", repo: "bbc" });
    const team = proposals.filter((p) => p.type === "team");
    expect(team).toHaveLength(2);
    expect(team[0].title).toBe("@alice");
    expect(team[0].source_ref).toBe("github:ZethT/bbc:team:alice");
    expect(team[0].fields.role).toBe("admin");
    expect(team[1].title).toBe("@charlie");
    expect(team[1].fields.role).toBe("collaborator");
  });

  it("403 on collaborators is non-fatal (fine-grained PATs commonly hit this)", async () => {
    const { fetch } = mockFetch({
      "https://api.github.com/repos/ZethT/bbc/contents/docs/decisions": notFound(),
      "https://api.github.com/repos/ZethT/bbc/contents/docs/adr": notFound(),
      "https://api.github.com/repos/ZethT/bbc/pulls": jsonRoute([]),
      "https://api.github.com/repos/ZethT/bbc/collaborators": () => ({
        ok: false,
        status: 403,
        body: { message: "forbidden" },
        headers: { "x-ratelimit-remaining": "55" },
      }),
    });
    const { proposals } = await collectSync(fetch, { owner: "ZethT", repo: "bbc" });
    expect(proposals.filter((p) => p.type === "team")).toHaveLength(0);
  });
});

// --------------------------------------------------------------------------
// 5. Rate-limit + auth classification
// --------------------------------------------------------------------------

describe("sync — error classification", () => {
  it("403 with x-ratelimit-remaining=0 throws RateLimitError (yield-converted)", async () => {
    // Directly assert the connector's HTTP path: pulls endpoint returns 403 with
    // rate-limit headers. The async generator surfaces the error on iteration.
    const { fetch } = mockFetch({
      "https://api.github.com/repos/ZethT/bbc/contents/docs/decisions": notFound(),
      "https://api.github.com/repos/ZethT/bbc/contents/docs/adr": notFound(),
      "https://api.github.com/repos/ZethT/bbc/pulls": () => ({
        ok: false,
        status: 403,
        body: { message: "API rate limit exceeded" },
        headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": String(Math.floor(Date.now() / 1000) + 60) },
      }),
    });
    const connector = createGithubConnector({ getToken: async () => "pat", fetch });
    const iter = connector.sync({ tenant_id: "t1", external_account_id: "a", cursor: null, config: { owner: "ZethT", repo: "bbc", include_collaborators: false } });
    await expect((async () => {
      for await (const _e of iter) void _e;
    })()).rejects.toThrow(/rate_limited/);
  });

  it("401 throws AuthExpiredError", async () => {
    const { fetch } = mockFetch({
      "https://api.github.com/repos/ZethT/bbc/contents/docs/decisions": () => ({
        ok: false,
        status: 401,
        body: { message: "Bad credentials" },
      }),
    });
    const connector = createGithubConnector({ getToken: async () => "pat", fetch });
    const iter = connector.sync({ tenant_id: "t1", external_account_id: "a", cursor: null, config: { owner: "ZethT", repo: "bbc" } });
    await expect((async () => {
      for await (const _e of iter) void _e;
    })()).rejects.toThrow(/auth_expired|github 401/);
  });
});

// --------------------------------------------------------------------------
// 6. End-to-end via runSync — dedup verification
// --------------------------------------------------------------------------

// --------------------------------------------------------------------------
// Codex regression: phase=done cursor must not block subsequent syncs.
// --------------------------------------------------------------------------

describe("sync — done cursor reset (codex-flagged [P1])", () => {
  it("a saved phase='done' cursor restarts at decisions on the next sync", async () => {
    const { fetch } = mockFetch({
      "https://api.github.com/repos/ZethT/bbc/contents/docs/decisions": jsonRoute([
        { type: "file", name: "0001.md", path: "docs/decisions/0001.md", sha: "a", download_url: "https://raw/a" },
      ]),
      "https://api.github.com/repos/ZethT/bbc/contents/docs/adr": notFound(),
      "https://raw/a": textRoute("# Fresh decision"),
      "https://api.github.com/repos/ZethT/bbc/pulls": jsonRoute([]),
      "https://api.github.com/repos/ZethT/bbc/collaborators": jsonRoute([]),
    });

    // Cursor from a previous successful run.
    const { proposals } = await collectSync(
      fetch,
      { owner: "ZethT", repo: "bbc" },
      "ghp_test",
      JSON.stringify({ phase: "done" }),
    );
    // Without the reset, this would emit zero proposals. With the reset, the
    // connector walks decisions → prs → team again and surfaces the new ADR.
    expect(proposals).toHaveLength(1);
    expect(proposals[0].type).toBe("decision");
    expect(proposals[0].title).toBe("Fresh decision");
  });
});

// --------------------------------------------------------------------------
// Codex regression: collaborators 403 + rate-limit-remaining=0 must classify.
// --------------------------------------------------------------------------

describe("sync — collaborators 403 rate-limit classification (codex-flagged [P2])", () => {
  it("403 with x-ratelimit-remaining=0 on collaborators throws RateLimitError", async () => {
    const { fetch } = mockFetch({
      "https://api.github.com/repos/ZethT/bbc/contents/docs/decisions": notFound(),
      "https://api.github.com/repos/ZethT/bbc/contents/docs/adr": notFound(),
      "https://api.github.com/repos/ZethT/bbc/pulls": jsonRoute([]),
      "https://api.github.com/repos/ZethT/bbc/collaborators": () => ({
        ok: false,
        status: 403,
        body: { message: "API rate limit exceeded" },
        headers: {
          "x-ratelimit-remaining": "0",
          "x-ratelimit-reset": String(Math.floor(Date.now() / 1000) + 60),
        },
      }),
    });
    const connector = createGithubConnector({ getToken: async () => "pat", fetch });
    const iter = connector.sync({
      tenant_id: "t1",
      external_account_id: "a",
      cursor: null,
      config: { owner: "ZethT", repo: "bbc" },
    });
    await expect((async () => {
      for await (const _e of iter) void _e;
    })()).rejects.toThrow(/rate_limited/);
  });

  it("non-rate-limit 403 on collaborators still swallows (fine-grained PAT)", async () => {
    const { fetch } = mockFetch({
      "https://api.github.com/repos/ZethT/bbc/contents/docs/decisions": notFound(),
      "https://api.github.com/repos/ZethT/bbc/contents/docs/adr": notFound(),
      "https://api.github.com/repos/ZethT/bbc/pulls": jsonRoute([]),
      "https://api.github.com/repos/ZethT/bbc/collaborators": () => ({
        ok: false,
        status: 403,
        body: { message: "Resource not accessible by personal access token" },
        headers: { "x-ratelimit-remaining": "4999" },
      }),
    });
    const { proposals } = await collectSync(fetch, { owner: "ZethT", repo: "bbc" });
    expect(proposals.filter((p) => p.type === "team")).toHaveLength(0);
  });
});

describe("github via runSync — dedup on re-run", () => {
  function makeDb(opts: { existingRefs?: Iterable<string> } = {}): {
    db: ConnectorDb;
    committed: MemoryProposal[];
  } {
    const committed: MemoryProposal[] = [];
    const existing = new Set(opts.existingRefs ?? []);
    const db: ConnectorDb = {
      async getConnector() {
        return {
          id: "row-1",
          external_account_id: "acc-1",
          mapping: { owner: "ZethT", repo: "bbc", include_collaborators: false, include_prs: false },
          sync_state: {},
        };
      },
      async getTokenExpiry() {
        return null;
      },
      async existingSourceRefs(_t, refs) {
        return new Set(refs.filter((r) => existing.has(r)));
      },
      async commitProposal(_t, _r, p) {
        committed.push(p);
        existing.add(p.source_ref);
      },
      async updateSyncState() {},
    };
    return { db, committed };
  }

  it("a second run after one PR was committed dedups it", async () => {
    const { fetch } = mockFetch({
      "https://api.github.com/repos/ZethT/bbc/contents/docs/decisions": jsonRoute([
        { type: "file", name: "0001.md", path: "docs/decisions/0001.md", sha: "a", download_url: "https://raw/a" },
        { type: "file", name: "0002.md", path: "docs/decisions/0002.md", sha: "b", download_url: "https://raw/b" },
      ]),
      "https://api.github.com/repos/ZethT/bbc/contents/docs/adr": notFound(),
      "https://raw/a": textRoute("# First\nBody"),
      "https://raw/b": textRoute("# Second\nBody"),
    });

    const connector = createGithubConnector({ getToken: async () => "pat", fetch });

    // Pretend 0001 was committed in a previous sync.
    const { db, committed } = makeDb({
      existingRefs: ["github:ZethT/bbc:file:docs/decisions/0001.md"],
    });
    const result = await runSync(connector, "t1", db);

    expect(result.status).toBe("ok");
    expect(result.emitted).toBe(1);
    expect(result.skipped_duplicates).toBe(1);
    expect(committed.map((p) => p.source_ref)).toEqual([
      "github:ZethT/bbc:file:docs/decisions/0002.md",
    ]);
  });
});
