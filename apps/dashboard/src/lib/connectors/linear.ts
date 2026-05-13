// v1.5 D-W4-1: Linear connector (OAuth).
//
// Walks a Linear workspace and emits MemoryProposals:
//   - Projects → `product` (one per project)
//   - Active cycles → `product` (cycle name + range; one per active cycle)
//   - Issues with an `adr` label → `decision`
//   - Issues without an `adr` label → `note`
//
// Why label-driven decisions (not comments)? The launch plan calls for
// "decisions pulled from issue comments tagged adr" but comments-as-units
// adds significant pagination + permission complexity. For v1.5 the
// label-on-issue path delivers the same outcome (a small set of decision
// rows) at a fraction of the API surface; comment-driven decisions are a
// post-v1 enhancement.
//
// OAuth (per https://developers.linear.app/docs/oauth/authentication):
//   - authorize: GET https://linear.app/oauth/authorize ?response_type=code
//     &client_id=... &redirect_uri=... &state=... &scope=read
//   - token exchange: POST https://api.linear.app/oauth/token
//     (form-urlencoded body — see complete_auth note below)
// Like Notion, the install server action owns the token exchange + persist
// step (it has Supabase + encryption); complete_auth() here is a stub.
//
// Cursor (JSON-encoded):
//   { phase: "projects" | "cycles" | "issues" | "done", endCursor: string|null }
// GraphQL cursors are stable per-edge, so we checkpoint after every page —
// unlike Notion's search where the cursor is response-relative.
//
// HTTP layer is injected so the connector is unit-testable.

import type {
  Connector,
  AuthURL,
  MemoryProposal,
  SyncContext,
  SyncEvent,
} from "./framework";

// --------------------------------------------------------------------------
// Public types
// --------------------------------------------------------------------------

export type LinearConfig = {
  /** Comma-separated label names that promote an issue from note → decision.
   *  Case-insensitive match. Default: ["adr"]. */
  decision_labels: string[];
  /** Cap on issues per sync, applied on top of framework's max_proposals. */
  issue_limit: number;
};

export type LinearCursor = {
  phase: "projects" | "cycles" | "issues" | "done";
  endCursor: string | null;
};

export type LinearFetch = (
  url: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string },
) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
  text: () => Promise<string>;
  headers: { get: (name: string) => string | null };
}>;

export type LinearConnectorDeps = {
  /** Resolve the OAuth access token from external_accounts (decrypts ciphertext). */
  getToken: (external_account_id: string) => Promise<string>;
  /** Build the Authorization header for the /oauth/token exchange. Production
   *  pulls from BBC_LINEAR_CLIENT_ID + BBC_LINEAR_CLIENT_SECRET. */
  getOAuthClientCredentials: () => { clientId: string; clientSecret: string };
  fetch?: LinearFetch;
};

// --- GraphQL response subset --------------------------------------------------

type LinearPageInfo = { hasNextPage: boolean; endCursor: string | null };

type LinearProject = {
  id: string;
  name: string;
  description: string | null;
  state: string | null;
  url: string;
  startDate: string | null;
  targetDate: string | null;
};

type LinearCycle = {
  id: string;
  name: string | null;
  number: number;
  startsAt: string;
  endsAt: string;
  team: { id: string; name: string } | null;
};

type LinearIssue = {
  id: string;
  identifier: string;
  title: string;
  description: string | null;
  url: string;
  updatedAt: string;
  labels: { nodes: { name: string }[] };
  team: { key: string; name: string } | null;
  project: { id: string; name: string } | null;
};

type LinearListResponse<T> = {
  nodes: T[];
  pageInfo: LinearPageInfo;
};

// --------------------------------------------------------------------------
// Connector factory
// --------------------------------------------------------------------------

const GRAPHQL_URL = "https://api.linear.app/graphql";
const AUTHORIZE_URL = "https://linear.app/oauth/authorize";
const TOKEN_URL = "https://api.linear.app/oauth/token";
const PAGE_SIZE = 50;
const DEFAULT_DECISION_LABELS = ["adr"];

export function createLinearConnector(deps: LinearConnectorDeps): Connector {
  const fetchImpl: LinearFetch = deps.fetch ?? defaultFetchAdapter();

  async function graphql<T>(token: string, query: string, variables: Record<string, unknown>, context: string): Promise<T> {
    const res = await fetchImpl(GRAPHQL_URL, {
      method: "POST",
      headers: linearHeaders(token),
      body: JSON.stringify({ query, variables }),
    });
    if (!res.ok) throw await asConnectorError(res, context);
    const body = (await res.json()) as { data?: T; errors?: { message: string }[] };
    if (body.errors && body.errors.length > 0) {
      // GraphQL transport-OK but auth errors land in `errors`. Treat any
      // message mentioning AUTHENTICATION as terminal so the framework records
      // auth_expired and stops looping.
      const msg = body.errors.map((e) => e.message).join("; ");
      if (/authentication|unauthenticated|invalid auth/i.test(msg)) {
        const { AuthExpiredError } = await import("./framework");
        throw new AuthExpiredError(`linear ${context}: ${msg}`);
      }
      throw new Error(`linear ${context}: ${msg}`);
    }
    if (!body.data) throw new Error(`linear ${context}: empty response data`);
    return body.data;
  }

  async function* iterateProjects(token: string, startCursor: string | null): AsyncGenerator<{ node: LinearProject; pageInfo: LinearPageInfo }, void, unknown> {
    let cursor = startCursor;
    while (true) {
      const data = await graphql<{ projects: LinearListResponse<LinearProject> }>(token, PROJECTS_QUERY, {
        first: PAGE_SIZE,
        after: cursor,
      }, "projects");
      for (const node of data.projects.nodes) {
        yield { node, pageInfo: data.projects.pageInfo };
      }
      if (!data.projects.pageInfo.hasNextPage || !data.projects.pageInfo.endCursor) return;
      cursor = data.projects.pageInfo.endCursor;
    }
  }

  async function* iterateCycles(token: string, startCursor: string | null): AsyncGenerator<{ node: LinearCycle; pageInfo: LinearPageInfo }, void, unknown> {
    let cursor = startCursor;
    while (true) {
      const data = await graphql<{ cycles: LinearListResponse<LinearCycle> }>(token, CYCLES_QUERY, {
        first: PAGE_SIZE,
        after: cursor,
      }, "cycles");
      for (const node of data.cycles.nodes) {
        yield { node, pageInfo: data.cycles.pageInfo };
      }
      if (!data.cycles.pageInfo.hasNextPage || !data.cycles.pageInfo.endCursor) return;
      cursor = data.cycles.pageInfo.endCursor;
    }
  }

  async function* iterateIssues(token: string, startCursor: string | null, limit: number): AsyncGenerator<{ node: LinearIssue; pageInfo: LinearPageInfo }, void, unknown> {
    let cursor = startCursor;
    let yielded = 0;
    while (yielded < limit) {
      const first = Math.min(PAGE_SIZE, limit - yielded);
      const data = await graphql<{ issues: LinearListResponse<LinearIssue> }>(token, ISSUES_QUERY, {
        first,
        after: cursor,
      }, "issues");
      for (const node of data.issues.nodes) {
        yield { node, pageInfo: data.issues.pageInfo };
        yielded++;
        if (yielded >= limit) return;
      }
      if (!data.issues.pageInfo.hasNextPage || !data.issues.pageInfo.endCursor) return;
      cursor = data.issues.pageInfo.endCursor;
    }
  }

  return {
    id: "linear",
    name: "Linear",
    description: "Sync Linear projects, active cycles, and issues as typed memory.",
    writes_to: ["product", "decision", "note"],
    oauth_scopes: ["read"],
    permission_summary:
      "Reads projects, cycles, and issues. Issues labeled `adr` become decisions; everything else is a note. No writes.",

    async authenticate(tenant_id, redirect_url): Promise<AuthURL> {
      const state = `tenant=${encodeURIComponent(tenant_id)};nonce=${cryptoRandomHex(16)}`;
      const { clientId } = deps.getOAuthClientCredentials();
      const url = new URL(AUTHORIZE_URL);
      url.searchParams.set("client_id", clientId);
      url.searchParams.set("redirect_uri", redirect_url);
      url.searchParams.set("response_type", "code");
      url.searchParams.set("scope", "read");
      url.searchParams.set("state", state);
      // actor=user: tokens scoped to the installing user, not the workspace
      // bot. Matches the launch-plan's "maintainer's Linear" acceptance.
      url.searchParams.set("actor", "user");
      return { url: url.toString(), state };
    },

    async complete_auth(_tenant_id, _code): Promise<{ external_account_id: string }> {
      // The install server action owns the form-urlencoded POST to TOKEN_URL
      // plus the external_accounts persistence (encryption + RLS). Mirrors
      // notion.complete_auth.
      throw new Error(
        "linear.complete_auth must be called from the install server action: " +
          "it receives the token-exchange response and persists it via external_accounts.",
      );
    },

    async *sync(ctx: SyncContext): AsyncIterable<SyncEvent> {
      if (!ctx.external_account_id) {
        throw new Error("linear connector: missing external_account_id");
      }
      const token = await deps.getToken(ctx.external_account_id);
      const cfg = parseConfig(ctx.config);
      const parsed = parseCursor(ctx.cursor);
      // 'done' cursor → fresh sweep. Framework dedup on source_ref handles
      // anything we already saw.
      const phase = !parsed || parsed.phase === "done"
        ? { phase: "projects" as const, endCursor: null }
        : parsed;

      // ---- Phase 1: projects ------------------------------------------
      // Projects are typically <100 per workspace, so we checkpoint only at
      // the phase boundary. If a workspace ever exceeds that, the framework
      // max_proposals cap still terminates cleanly.
      if (phase.phase === "projects") {
        for await (const { node } of iterateProjects(token, phase.endCursor)) {
          yield { kind: "proposal", proposal: projectToProposal(node) };
        }
        yield { kind: "checkpoint", cursor: stringifyCursor({ phase: "cycles", endCursor: null }) };
      }

      // ---- Phase 2: cycles --------------------------------------------
      if (phase.phase === "projects" || phase.phase === "cycles") {
        const startCursor = phase.phase === "cycles" ? phase.endCursor : null;
        for await (const { node } of iterateCycles(token, startCursor)) {
          yield { kind: "proposal", proposal: cycleToProposal(node) };
        }
        yield { kind: "checkpoint", cursor: stringifyCursor({ phase: "issues", endCursor: null }) };
      }

      // ---- Phase 3: issues --------------------------------------------
      if (phase.phase === "projects" || phase.phase === "cycles" || phase.phase === "issues") {
        const startCursor = phase.phase === "issues" ? phase.endCursor : null;
        const decisionLabels = new Set(cfg.decision_labels.map((s) => s.toLowerCase()));
        let lastEndCursor: string | null = null;
        let sinceCheckpoint = 0;
        for await (const { node, pageInfo } of iterateIssues(token, startCursor, cfg.issue_limit)) {
          yield { kind: "proposal", proposal: issueToProposal(node, decisionLabels) };
          sinceCheckpoint++;
          lastEndCursor = pageInfo.endCursor;
          // Checkpoint at GraphQL page boundaries. We approximate by stamping
          // every PAGE_SIZE nodes — GraphQL cursors are stable so even if we
          // resume mid-page the next query re-fetches the remainder.
          if (sinceCheckpoint >= PAGE_SIZE) {
            yield { kind: "checkpoint", cursor: stringifyCursor({ phase: "issues", endCursor: lastEndCursor }) };
            sinceCheckpoint = 0;
          }
        }
      }

      yield { kind: "checkpoint", cursor: stringifyCursor({ phase: "done", endCursor: null }) };
    },

    sync_schedule: { interval_minutes: 60 },
    max_proposals_per_sync: 300,
    rate_limit_strategy: { base_delay_ms: 1_000, max_delay_ms: 60_000, max_retries: 3 },
  };
}

// --------------------------------------------------------------------------
// Config + cursor helpers
// --------------------------------------------------------------------------

export function parseConfig(raw: Record<string, unknown>): LinearConfig {
  const labelsRaw = raw.decision_labels;
  let decision_labels: string[] = DEFAULT_DECISION_LABELS;
  if (Array.isArray(labelsRaw)) {
    const cleaned = labelsRaw.filter((s): s is string => typeof s === "string" && s.trim().length > 0).map((s) => s.trim());
    if (cleaned.length > 0) decision_labels = cleaned;
  }
  const limitRaw = raw.issue_limit;
  const issue_limit =
    typeof limitRaw === "number" && Number.isInteger(limitRaw) && limitRaw > 0 ? Math.min(1_000, limitRaw) : 300;
  return { decision_labels, issue_limit };
}

function parseCursor(raw: string | null): LinearCursor | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as { phase?: unknown; endCursor?: unknown };
    if (o.phase !== "projects" && o.phase !== "cycles" && o.phase !== "issues" && o.phase !== "done") return null;
    const endCursor = typeof o.endCursor === "string" || o.endCursor === null ? o.endCursor : null;
    return { phase: o.phase, endCursor };
  } catch {
    return null;
  }
}

function stringifyCursor(c: LinearCursor): string {
  return JSON.stringify(c);
}

// --------------------------------------------------------------------------
// Mappers — Linear shape → MemoryProposal
// --------------------------------------------------------------------------

export function projectToProposal(p: LinearProject): MemoryProposal {
  const lines: string[] = [];
  if (p.description) lines.push(p.description);
  const range =
    p.startDate && p.targetDate
      ? `\n_Timeline: ${p.startDate} → ${p.targetDate}._`
      : p.targetDate
        ? `\n_Targets ${p.targetDate}._`
        : "";
  if (range) lines.push(range.trim());
  lines.push(`\n_Synced from Linear: ${p.url}_`);
  return {
    type: "product",
    title: p.name.slice(0, 200) || "Untitled project",
    body: lines.join("\n").trim(),
    fields: {
      // product schema is permissive; we surface what's stable.
      name: p.name,
      status: p.state ?? "active",
      source_ref: p.id,
      source_permalink: p.url,
      source_kind: "linear_project",
    },
    source_ref: `linear:project:${p.id}`,
  };
}

export function cycleToProposal(c: LinearCycle): MemoryProposal {
  const name = c.name && c.name.length > 0 ? c.name : `Cycle ${c.number}`;
  const team = c.team ? `${c.team.name} · ` : "";
  return {
    type: "product",
    title: `${team}${name}`.slice(0, 200),
    body: [
      `Cycle ${c.number}${c.team ? ` of ${c.team.name}` : ""}.`,
      `_Runs ${c.startsAt.slice(0, 10)} → ${c.endsAt.slice(0, 10)}._`,
    ].join("\n"),
    fields: {
      name,
      status: "active",
      source_ref: c.id,
      source_kind: "linear_cycle",
    },
    source_ref: `linear:cycle:${c.id}`,
  };
}

export function issueToProposal(i: LinearIssue, decisionLabels: ReadonlySet<string>): MemoryProposal {
  const isDecision = i.labels.nodes.some((l) => decisionLabels.has(l.name.toLowerCase()));
  const titleBase = `${i.identifier}: ${i.title}`.slice(0, 200);
  const tailing = `\n_From ${i.url} · updated ${i.updatedAt.slice(0, 10)}._`;
  if (isDecision) {
    return {
      type: "decision",
      title: titleBase,
      body: ((i.description ?? "").slice(0, 4_000) + tailing).trim(),
      fields: {
        decision: i.title,
        status: "active",
        decided_on: i.updatedAt.slice(0, 10),
        source_ref: i.id,
        source_permalink: i.url,
        source_kind: "linear_issue",
      },
      source_ref: `linear:issue:${i.id}`,
    };
  }
  return {
    type: "note",
    title: titleBase,
    body: ((i.description ?? "").slice(0, 4_000) + tailing).trim(),
    fields: {
      source_ref: i.id,
      source_permalink: i.url,
      source_kind: "linear_issue",
    },
    source_ref: `linear:issue:${i.id}`,
  };
}

// --------------------------------------------------------------------------
// GraphQL queries
// --------------------------------------------------------------------------

const PROJECTS_QUERY = `
  query Projects($first: Int!, $after: String) {
    projects(first: $first, after: $after, orderBy: updatedAt) {
      nodes {
        id name description state url startDate targetDate
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

const CYCLES_QUERY = `
  query Cycles($first: Int!, $after: String) {
    cycles(first: $first, after: $after, filter: { isActive: { eq: true } }) {
      nodes {
        id name number startsAt endsAt
        team { id name }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

const ISSUES_QUERY = `
  query Issues($first: Int!, $after: String) {
    issues(first: $first, after: $after, orderBy: updatedAt) {
      nodes {
        id identifier title description url updatedAt
        labels { nodes { name } }
        team { key name }
        project { id name }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

// --------------------------------------------------------------------------
// Error classification + headers
// --------------------------------------------------------------------------

function linearHeaders(token: string): Record<string, string> {
  return {
    // Linear accepts both "Bearer <token>" and bare "<token>" — Bearer is
    // canonical for OAuth-issued tokens.
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "User-Agent": "bbc-connector/0.1",
  };
}

async function asConnectorError(
  res: { status: number; headers: { get: (n: string) => string | null }; text: () => Promise<string> },
  context: string,
): Promise<Error> {
  if (res.status === 401 || res.status === 403) {
    const { AuthExpiredError } = await import("./framework");
    return new AuthExpiredError(`linear ${res.status} on ${context}`);
  }
  if (res.status === 429) {
    const { RateLimitError } = await import("./framework");
    const retryAfter = parseInt(res.headers.get("retry-after") ?? "", 10);
    return new RateLimitError(Number.isFinite(retryAfter) ? retryAfter * 1000 : undefined);
  }
  const body = await res.text().catch(() => "");
  return new Error(`linear ${res.status} on ${context}: ${body.slice(0, 200)}`);
}

function cryptoRandomHex(bytes: number): string {
  const arr = new Uint8Array(bytes);
  globalThis.crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}

function defaultFetchAdapter(): LinearFetch {
  return async (url, init) => {
    const res = await fetch(url, init);
    return {
      ok: res.ok,
      status: res.status,
      json: () => res.json(),
      text: () => res.text(),
      headers: { get: (n: string) => res.headers.get(n) },
    };
  };
}
