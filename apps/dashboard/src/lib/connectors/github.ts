// v1.5 D-W3-3: GitHub connector (PAT auth).
//
// Walks a configured GitHub repo and emits MemoryProposals:
//   - markdown files under `docs/decisions/` and `docs/adr/` → `decision`
//   - recent merged PRs → `note` (SHA is the source_ref)
//   - repo collaborators → `team`
//
// PAT (Personal Access Token) auth — no OAuth flow. The token lives in
// external_accounts as the connector secret. `complete_auth(tenant_id, code)`
// accepts the PAT as `code`.
//
// Config (tenant_connectors.mapping):
//   - owner: string                        — required, e.g. "ZethT"
//   - repo: string                         — required, e.g. "bbc"
//   - decision_paths?: string[]            — default ["docs/decisions", "docs/adr"]
//   - include_prs?: boolean                — default true
//   - include_collaborators?: boolean      — default true
//   - pr_state?: "closed" | "all"          — default "closed" (merged only post-filter)
//
// Cursor:
//   { phase: "decisions" | "prs" | "team" | "done", offset?: number }
// We walk the three phases in order. Items within a phase are paginated by
// offset (decisions = file index, prs = page number, team = page number).
// Each phase boundary is a checkpoint event.
//
// The HTTP layer is injected so the connector is unit-testable. Production
// wires `globalThis.fetch`; tests pass a mock that returns canned responses.

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

export type GithubConfig = {
  owner: string;
  repo: string;
  decision_paths: string[];
  include_prs: boolean;
  include_collaborators: boolean;
  pr_state: "closed" | "all";
};

export type GithubCursor = {
  phase: "decisions" | "prs" | "team" | "done";
  offset?: number;
};

/** Minimal subset of GitHub API responses we touch. */
type GithubContent =
  | { type: "file"; name: string; path: string; sha: string; download_url: string | null }
  | { type: "dir"; name: string; path: string; sha: string; download_url: null };

type GithubPR = {
  number: number;
  title: string;
  body: string | null;
  merge_commit_sha: string | null;
  merged_at: string | null;
  html_url: string;
  user: { login: string } | null;
};

type GithubCollaborator = {
  login: string;
  html_url: string;
  type: string;
  // role_name is on the org-level endpoint; harmless if missing on user-level repos.
  role_name?: string;
};

/** Injected HTTP fetcher — production: globalThis.fetch; tests: mocked. */
export type GithubFetch = (url: string, init?: { headers?: Record<string, string> }) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
  text: () => Promise<string>;
  headers: { get: (name: string) => string | null };
}>;

export type GithubConnectorDeps = {
  /** Resolve the PAT for an external_account_id (decrypts secret_ciphertext). */
  getToken: (external_account_id: string) => Promise<string>;
  fetch?: GithubFetch;
};

// --------------------------------------------------------------------------
// Connector factory
// --------------------------------------------------------------------------

const DECISION_DEFAULT_PATHS = ["docs/decisions", "docs/adr"];
const PR_PAGE_SIZE = 30;
const TEAM_PAGE_SIZE = 30;
const MARKDOWN_RE = /\.md$/i;

export function createGithubConnector(deps: GithubConnectorDeps): Connector {
  const fetchImpl: GithubFetch = deps.fetch ?? defaultFetchAdapter();

  return {
    id: "github",
    name: "GitHub",
    description: "Sync ADRs, recent merged PRs, and collaborators from a GitHub repo.",
    writes_to: ["decision", "note", "team"],
    permission_summary:
      "Reads markdown files at decision_paths, recent closed PRs, and the repo's collaborator list. Requires a Personal Access Token with `repo` scope (private repos) or no scope (public).",

    async authenticate(_tenant_id, _redirect_url): Promise<AuthURL> {
      // PAT install: the dashboard renders a "paste your PAT" form rather than
      // bouncing through an OAuth provider. We surface a sentinel URL the
      // Library install drawer recognizes (D-W3-5).
      return { url: "/library/install/github", state: "" };
    },

    async complete_auth(_tenant_id, _code): Promise<{ external_account_id: string }> {
      // The actual PAT-store path lives in a server action (so the Supabase
      // service client + encryption helpers stay out of this module). The
      // server action calls back into installConnector(). This stub satisfies
      // the interface but is not exercised in the PAT flow.
      throw new Error("github connector uses the PAT install action, not complete_auth");
    },

    async *sync(ctx: SyncContext): AsyncIterable<SyncEvent> {
      const cfg = parseConfig(ctx.config);
      if (!ctx.external_account_id) {
        throw new Error("github connector: missing external_account_id (PAT not configured)");
      }
      const pat = await deps.getToken(ctx.external_account_id);
      const headers = githubHeaders(pat);
      // A previous successful sync left cursor='{"phase":"done"}'. Treat that as
      // a fresh start so we re-poll the repo for new ADRs / PRs / collaborators.
      // Framework dedup on source_ref handles items we already saw.
      const parsed = parseCursor(ctx.cursor);
      const phase =
        !parsed || parsed.phase === "done"
          ? { phase: "decisions" as const, offset: 0 }
          : parsed;

      // ---- Phase 1: decisions ------------------------------------------
      if (phase.phase === "decisions") {
        let fileOffset = phase.offset ?? 0;
        const files = await listMarkdownFiles(fetchImpl, headers, cfg);
        for (let i = fileOffset; i < files.length; i++) {
          const file = files[i];
          const text = await fetchFileContent(fetchImpl, headers, cfg, file);
          if (text === null) continue;
          yield { kind: "proposal", proposal: fileToDecision(cfg, file, text) };
          fileOffset = i + 1;
          if ((i + 1) % 10 === 0) {
            yield { kind: "checkpoint", cursor: stringifyCursor({ phase: "decisions", offset: fileOffset }) };
          }
        }
        yield { kind: "checkpoint", cursor: stringifyCursor({ phase: "prs", offset: 1 }) };
        if (!cfg.include_prs && !cfg.include_collaborators) {
          yield { kind: "checkpoint", cursor: stringifyCursor({ phase: "done" }) };
          return;
        }
      }

      // ---- Phase 2: recent merged PRs ---------------------------------
      if (cfg.include_prs && (phase.phase === "decisions" || phase.phase === "prs")) {
        let page = phase.phase === "prs" ? phase.offset ?? 1 : 1;
        // Cap at 5 pages = 150 PRs; framework's max_proposals cap takes over after that.
        const MAX_PAGES = 5;
        for (let p = 0; p < MAX_PAGES; p++) {
          const prs = await fetchPRs(fetchImpl, headers, cfg, page);
          if (prs.length === 0) break;
          for (const pr of prs) {
            // Only emit merged PRs — closed-but-not-merged PRs are not memory-worthy.
            if (!pr.merged_at || !pr.merge_commit_sha) continue;
            yield { kind: "proposal", proposal: prToNote(cfg, pr) };
          }
          page++;
          yield { kind: "checkpoint", cursor: stringifyCursor({ phase: "prs", offset: page }) };
          if (prs.length < PR_PAGE_SIZE) break;
        }
        yield { kind: "checkpoint", cursor: stringifyCursor({ phase: "team", offset: 1 }) };
        if (!cfg.include_collaborators) {
          yield { kind: "checkpoint", cursor: stringifyCursor({ phase: "done" }) };
          return;
        }
      }

      // ---- Phase 3: collaborators -------------------------------------
      if (cfg.include_collaborators) {
        let page = phase.phase === "team" ? phase.offset ?? 1 : 1;
        const MAX_PAGES = 5;
        for (let p = 0; p < MAX_PAGES; p++) {
          const team = await fetchCollaborators(fetchImpl, headers, cfg, page);
          if (team.length === 0) break;
          for (const member of team) {
            if (member.type !== "User") continue;
            yield { kind: "proposal", proposal: collaboratorToTeam(cfg, member) };
          }
          page++;
          yield { kind: "checkpoint", cursor: stringifyCursor({ phase: "team", offset: page }) };
          if (team.length < TEAM_PAGE_SIZE) break;
        }
      }

      yield { kind: "checkpoint", cursor: stringifyCursor({ phase: "done" }) };
    },

    sync_schedule: { interval_minutes: 60 },
    max_proposals_per_sync: 200,
    rate_limit_strategy: { base_delay_ms: 60_000, max_delay_ms: 60 * 60 * 1000, max_retries: 3 },
  };
}

// --------------------------------------------------------------------------
// Config + cursor helpers
// --------------------------------------------------------------------------

export function parseConfig(raw: Record<string, unknown>): GithubConfig {
  const owner = stringField(raw, "owner");
  const repo = stringField(raw, "repo");
  if (!owner || !repo) {
    throw new Error("github connector: config requires { owner, repo }");
  }
  const paths = stringArrayField(raw, "decision_paths") ?? DECISION_DEFAULT_PATHS;
  return {
    owner,
    repo,
    decision_paths: paths,
    include_prs: raw.include_prs !== false,
    include_collaborators: raw.include_collaborators !== false,
    pr_state: raw.pr_state === "all" ? "all" : "closed",
  };
}

function parseCursor(raw: string | null): GithubCursor | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as { phase?: unknown; offset?: unknown };
    const phase = o.phase;
    if (phase !== "decisions" && phase !== "prs" && phase !== "team" && phase !== "done") return null;
    const offset = typeof o.offset === "number" && Number.isFinite(o.offset) ? o.offset : undefined;
    return { phase, offset };
  } catch {
    return null;
  }
}

function stringifyCursor(c: GithubCursor): string {
  return JSON.stringify(c);
}

function stringField(o: Record<string, unknown>, k: string): string | null {
  const v = o[k];
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
}

function stringArrayField(o: Record<string, unknown>, k: string): string[] | null {
  const v = o[k];
  if (!Array.isArray(v)) return null;
  const out: string[] = [];
  for (const item of v) if (typeof item === "string" && item.trim().length > 0) out.push(item.trim());
  return out.length > 0 ? out : null;
}

function githubHeaders(pat: string): Record<string, string> {
  return {
    Authorization: `Bearer ${pat}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "bbc-connector/0.1",
  };
}

// --------------------------------------------------------------------------
// GitHub API surface
// --------------------------------------------------------------------------

async function listMarkdownFiles(
  fetchImpl: GithubFetch,
  headers: Record<string, string>,
  cfg: GithubConfig,
): Promise<GithubContent[]> {
  const out: GithubContent[] = [];
  for (const path of cfg.decision_paths) {
    const url = `https://api.github.com/repos/${enc(cfg.owner)}/${enc(cfg.repo)}/contents/${encPath(path)}`;
    const res = await fetchImpl(url, { headers });
    if (res.status === 404) continue; // path absent — fine
    if (!res.ok) throw await asConnectorError(res, `listing ${path}`);
    const body = (await res.json()) as GithubContent | GithubContent[];
    const items = Array.isArray(body) ? body : [body];
    for (const item of items) {
      if (item.type === "file" && MARKDOWN_RE.test(item.name)) out.push(item);
    }
  }
  // Deterministic order by path so re-runs hit cursor offsets the same way.
  out.sort((a, b) => a.path.localeCompare(b.path));
  return out;
}

async function fetchFileContent(
  fetchImpl: GithubFetch,
  headers: Record<string, string>,
  _cfg: GithubConfig,
  file: GithubContent,
): Promise<string | null> {
  if (!file.download_url) return null;
  const res = await fetchImpl(file.download_url, { headers });
  if (!res.ok) throw await asConnectorError(res, `downloading ${file.path}`);
  return await res.text();
}

async function fetchPRs(
  fetchImpl: GithubFetch,
  headers: Record<string, string>,
  cfg: GithubConfig,
  page: number,
): Promise<GithubPR[]> {
  const url =
    `https://api.github.com/repos/${enc(cfg.owner)}/${enc(cfg.repo)}/pulls` +
    `?state=${cfg.pr_state}&sort=updated&direction=desc&per_page=${PR_PAGE_SIZE}&page=${page}`;
  const res = await fetchImpl(url, { headers });
  if (!res.ok) throw await asConnectorError(res, `fetching PRs page ${page}`);
  return (await res.json()) as GithubPR[];
}

async function fetchCollaborators(
  fetchImpl: GithubFetch,
  headers: Record<string, string>,
  cfg: GithubConfig,
  page: number,
): Promise<GithubCollaborator[]> {
  const url =
    `https://api.github.com/repos/${enc(cfg.owner)}/${enc(cfg.repo)}/collaborators` +
    `?per_page=${TEAM_PAGE_SIZE}&page=${page}`;
  const res = await fetchImpl(url, { headers });
  // Public repos / fine-grained PATs commonly 403 on collaborators. We swallow
  // permission-style 403s ("no collaborators readable") but MUST surface a
  // rate-limit 403 (x-ratelimit-remaining: 0) so the framework can record
  // status='rate_limited' and the user knows to back off.
  if (res.status === 404) return [];
  if (res.status === 403 && res.headers.get("x-ratelimit-remaining") !== "0") return [];
  if (!res.ok) throw await asConnectorError(res, `fetching collaborators page ${page}`);
  return (await res.json()) as GithubCollaborator[];
}

async function asConnectorError(
  res: { status: number; headers: { get: (n: string) => string | null }; text: () => Promise<string> },
  context: string,
): Promise<Error> {
  if (res.status === 401 || res.status === 403) {
    // Distinguish auth-revoked from rate-limit. GitHub 403 + x-ratelimit-remaining: 0 = rate limit.
    const remaining = res.headers.get("x-ratelimit-remaining");
    if (res.status === 403 && remaining === "0") {
      const { RateLimitError } = await import("./framework");
      const reset = parseInt(res.headers.get("x-ratelimit-reset") ?? "", 10);
      const retryMs = Number.isFinite(reset) ? Math.max(0, reset * 1000 - Date.now()) : undefined;
      return new RateLimitError(retryMs);
    }
    const { AuthExpiredError } = await import("./framework");
    return new AuthExpiredError(`github ${res.status} on ${context}`);
  }
  if (res.status === 429) {
    const { RateLimitError } = await import("./framework");
    const retryAfter = parseInt(res.headers.get("retry-after") ?? "", 10);
    return new RateLimitError(Number.isFinite(retryAfter) ? retryAfter * 1000 : undefined);
  }
  const body = await res.text().catch(() => "");
  return new Error(`github ${res.status} on ${context}: ${body.slice(0, 200)}`);
}

// --------------------------------------------------------------------------
// Mappers — provider shape → MemoryProposal
// --------------------------------------------------------------------------

function fileToDecision(cfg: GithubConfig, file: GithubContent, body: string): MemoryProposal {
  const title = deriveTitle(file.name, body);
  return {
    type: "decision",
    title,
    body,
    fields: {
      // decision schema expects: title, decision (text), decided_on (date string),
      // status. We let the queue accept-stage fill what we can't derive cleanly.
      // source_ref + permalink are carried through for provenance.
      decision: title,
      status: "active",
      source_ref: file.path,
      source_permalink: `https://github.com/${cfg.owner}/${cfg.repo}/blob/HEAD/${file.path}`,
      source_kind: "github_file",
    },
    source_ref: `github:${cfg.owner}/${cfg.repo}:file:${file.path}`,
  };
}

function prToNote(cfg: GithubConfig, pr: GithubPR): MemoryProposal {
  const title = pr.title.slice(0, 200);
  // Body: PR description + the GitHub permalink so the eventual memory_files
  // row stays self-contained even if the PR is later deleted.
  const lines = [
    pr.body?.slice(0, 4_000) ?? "",
    "",
    `_Merged from ${pr.html_url} by @${pr.user?.login ?? "unknown"} on ${pr.merged_at}._`,
  ];
  return {
    type: "note",
    title: `PR #${pr.number}: ${title}`,
    body: lines.join("\n").trim(),
    fields: {
      source_ref: pr.merge_commit_sha ?? `pr-${pr.number}`,
      source_permalink: pr.html_url,
      source_kind: "github_pr",
    },
    source_ref: `github:${cfg.owner}/${cfg.repo}:pr:${pr.merge_commit_sha ?? pr.number}`,
  };
}

function collaboratorToTeam(cfg: GithubConfig, member: GithubCollaborator): MemoryProposal {
  return {
    type: "team",
    title: `@${member.login}`,
    body: `GitHub collaborator on ${cfg.owner}/${cfg.repo}${member.role_name ? ` (${member.role_name})` : ""}.`,
    fields: {
      // team schema typically: name, role, contact. We have a github handle.
      name: `@${member.login}`,
      role: member.role_name ?? "collaborator",
      contact: member.html_url,
      source_ref: member.login,
      source_kind: "github_collaborator",
    },
    source_ref: `github:${cfg.owner}/${cfg.repo}:team:${member.login.toLowerCase()}`,
  };
}

function deriveTitle(filename: string, body: string): string {
  // Prefer the first non-empty markdown H1; fall back to filename without extension.
  for (const line of body.split(/\r?\n/, 50)) {
    const m = line.match(/^#\s+(.+?)\s*$/);
    if (m && m[1].trim().length > 0) return m[1].trim().slice(0, 200);
  }
  return filename.replace(/\.md$/i, "").replace(/[-_]/g, " ");
}

function enc(s: string): string {
  return encodeURIComponent(s);
}

function encPath(p: string): string {
  return p.split("/").map(encodeURIComponent).join("/");
}

function defaultFetchAdapter(): GithubFetch {
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
