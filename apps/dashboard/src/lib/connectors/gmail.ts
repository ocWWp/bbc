// v1.5 D-W5-2: Gmail connector (OAuth via shared google-oauth helper).
//
// Walks the user's threads matching a configurable Gmail search query and
// emits MemoryProposals:
//   - Default query: `in:inbox newer_than:30d`
//   - Threads with a "pin" label (default: `STARRED`) → `decision`
//   - All other threads → `note`
//   - Each unique From/To email address → `team` (one-shot per address; framework
//     dedupes on source_ref so re-syncs don't re-emit).
//
// API shape (per https://developers.google.com/gmail/api/reference/rest):
//   - GET /users/me/threads?q=&pageToken=&maxResults=
//   - GET /users/me/threads/{id}?format=metadata&metadataHeaders=From,To,Subject,Date
//
// Cursor JSON: { phase: "threads" | "done", pageToken: string | null }.
//
// HTTP layer is injected so the connector is unit-testable.

import type {
  AuthExpiredError as AuthExpiredErrorT,
  Connector,
  AuthURL,
  MemoryProposal,
  SyncContext,
  SyncEvent,
} from "./framework";
import {
  buildAuthorizeUrl,
  buildOAuthState,
  cryptoRandomHex,
  GMAIL_SCOPES,
  refreshAccessToken,
  type GoogleFetch,
} from "./google-oauth";

// --------------------------------------------------------------------------
// Public types
// --------------------------------------------------------------------------

export type GmailConfig = {
  /** Gmail search query string. Default: "in:inbox newer_than:30d". */
  query: string;
  /** Label IDs that promote a thread from note → decision. Case-sensitive
   *  match against `labelIds`. Default: ["STARRED"]. Custom labels can be
   *  added by their display name; Gmail label IDs are usually the display
   *  name uppercased, but custom labels keep their original casing. */
  decision_labels: string[];
  /** Cap on threads per sync. Layered on top of framework's max_proposals
   *  cap, which counts every proposal (threads + team contacts). */
  thread_limit: number;
};

export type GmailCursor = {
  phase: "threads" | "done";
  pageToken: string | null;
};

export type GmailConnectorDeps = {
  /** Resolve the OAuth access token from external_accounts. */
  getToken: (external_account_id: string) => Promise<string>;
  /** Resolve the OAuth refresh token + persist the new access token after a
   *  refresh. The install server action owns persistence; this hook lets the
   *  framework's refresh_token() round-trip back to storage. */
  getRefreshToken: (external_account_id: string) => Promise<string>;
  persistRefreshedToken: (
    external_account_id: string,
    tokens: { access_token: string; expires_in: number },
  ) => Promise<void>;
  getOAuthClientCredentials: () => { clientId: string; clientSecret: string };
  getRedirectUri: () => string;
  fetch?: GoogleFetch;
};

// --- Gmail API subset ---------------------------------------------------------

type GmailThreadList = {
  threads?: Array<{ id: string; historyId?: string; snippet?: string }>;
  nextPageToken?: string;
  resultSizeEstimate?: number;
};

type GmailMessage = {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet?: string;
  internalDate?: string;
  payload?: {
    headers?: Array<{ name: string; value: string }>;
  };
};

type GmailThread = {
  id: string;
  historyId?: string;
  messages: GmailMessage[];
};

// --------------------------------------------------------------------------
// Connector factory
// --------------------------------------------------------------------------

const API_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";
const PAGE_SIZE = 100;
const DEFAULT_QUERY = "in:inbox newer_than:30d";
const DEFAULT_DECISION_LABELS = ["STARRED"];
const METADATA_HEADERS = ["From", "To", "Cc", "Subject", "Date"];

export function createGmailConnector(deps: GmailConnectorDeps): Connector {
  const fetchImpl: GoogleFetch = deps.fetch ?? defaultFetchAdapter();

  async function gmailGet<T>(token: string, path: string, query: Record<string, string | string[]>, context: string): Promise<T> {
    const url = new URL(`${API_BASE}${path}`);
    for (const [k, v] of Object.entries(query)) {
      if (Array.isArray(v)) v.forEach((entry) => url.searchParams.append(k, entry));
      else url.searchParams.set(k, v);
    }
    const res = await fetchImpl(url.toString(), { headers: gmailHeaders(token) });
    if (!res.ok) throw await asConnectorError(res, context);
    return (await res.json()) as T;
  }

  async function* iterateThreads(
    token: string,
    query: string,
    startPageToken: string | null,
    limit: number,
  ): AsyncGenerator<{ id: string; pageToken: string | null; isPageBoundary: boolean }, void, unknown> {
    let pageToken: string | null = startPageToken;
    let yielded = 0;
    while (yielded < limit) {
      const params: Record<string, string> = {
        q: query,
        maxResults: String(Math.min(PAGE_SIZE, limit - yielded)),
      };
      if (pageToken) params.pageToken = pageToken;
      const data = await gmailGet<GmailThreadList>(token, "/threads", params, "threads.list");
      const threads = data.threads ?? [];
      const nextPageToken: string | null = data.nextPageToken ?? null;
      for (let i = 0; i < threads.length; i++) {
        const isLast = i === threads.length - 1;
        yield { id: threads[i].id, pageToken: isLast ? nextPageToken : null, isPageBoundary: isLast };
        yielded++;
        if (yielded >= limit) return;
      }
      if (!nextPageToken) return;
      pageToken = nextPageToken;
    }
  }

  async function getThread(token: string, threadId: string): Promise<GmailThread> {
    return gmailGet<GmailThread>(
      token,
      `/threads/${encodeURIComponent(threadId)}`,
      { format: "metadata", metadataHeaders: METADATA_HEADERS },
      `threads.get ${threadId}`,
    );
  }

  return {
    id: "gmail",
    name: "Gmail",
    description:
      "Sync Gmail threads matching a query as typed memory. Starred threads (or any custom label) become decisions; the rest become notes. Senders/recipients become team rows.",
    writes_to: ["note", "decision", "team"],
    oauth_scopes: [...GMAIL_SCOPES],
    permission_summary:
      "Reads Gmail threads matching your query (default: inbox, last 30 days). Headers are scanned for contacts. No writes; no send/modify access.",

    async authenticate(tenant_id, redirect_url): Promise<AuthURL> {
      const { clientId } = deps.getOAuthClientCredentials();
      const state = buildOAuthState({ tenant_id, provider: "gmail", nonce: cryptoRandomHex(16) });
      const url = buildAuthorizeUrl({
        clientId,
        redirectUri: redirect_url,
        scopes: GMAIL_SCOPES,
        state,
      });
      return { url, state };
    },

    async complete_auth(_tenant_id, _code): Promise<{ external_account_id: string }> {
      // Install server action owns the form-urlencoded token exchange +
      // external_accounts persistence (encryption + RLS), same pattern as
      // notion + linear. Use exchangeCodeForTokens from ./google-oauth.
      throw new Error(
        "gmail.complete_auth must be called from the install server action: " +
          "use exchangeCodeForTokens from ./google-oauth, then persist via external_accounts.",
      );
    },

    async refresh_token(external_account_id: string): Promise<void> {
      const { clientId, clientSecret } = deps.getOAuthClientCredentials();
      const refreshToken = await deps.getRefreshToken(external_account_id);
      const tokens = await refreshAccessToken({
        refreshToken,
        clientId,
        clientSecret,
        fetch: fetchImpl,
      });
      await deps.persistRefreshedToken(external_account_id, {
        access_token: tokens.access_token,
        expires_in: tokens.expires_in,
      });
    },

    async *sync(ctx: SyncContext): AsyncIterable<SyncEvent> {
      if (!ctx.external_account_id) {
        throw new Error("gmail connector: missing external_account_id");
      }
      const token = await deps.getToken(ctx.external_account_id);
      const cfg = parseConfig(ctx.config);
      const parsed = parseCursor(ctx.cursor);
      // 'done' cursor → fresh sweep. Framework dedup on source_ref handles
      // anything we already saw.
      const startPageToken = !parsed || parsed.phase === "done" ? null : parsed.pageToken;

      const seenContacts = new Set<string>();
      const decisionLabels = new Set(cfg.decision_labels);

      let lastEmittedPageToken: string | null = null;
      let hasMore = false;
      for await (const { id, pageToken, isPageBoundary } of iterateThreads(token, cfg.query, startPageToken, cfg.thread_limit)) {
        const thread = await getThread(token, id);
        const props = threadToProposals(thread, decisionLabels, seenContacts);
        for (const p of props) {
          yield { kind: "proposal", proposal: p };
        }
        if (isPageBoundary) {
          lastEmittedPageToken = pageToken;
          if (pageToken) {
            hasMore = true;
            yield { kind: "checkpoint", cursor: stringifyCursor({ phase: "threads", pageToken }) };
          }
        }
      }

      // If the loop ended with no more pages OR we hit the thread_limit but
      // Gmail had no more results either, mark done. If we hit thread_limit
      // while Gmail still has more pages, stay in the threads phase so the
      // next sync resumes from there.
      if (hasMore && lastEmittedPageToken) {
        yield { kind: "checkpoint", cursor: stringifyCursor({ phase: "threads", pageToken: lastEmittedPageToken }) };
        return;
      }
      yield { kind: "checkpoint", cursor: stringifyCursor({ phase: "done", pageToken: null }) };
    },

    sync_schedule: { interval_minutes: 60 },
    max_proposals_per_sync: 300,
    rate_limit_strategy: { base_delay_ms: 1_000, max_delay_ms: 60_000, max_retries: 3 },
  };
}

// --------------------------------------------------------------------------
// Config + cursor helpers
// --------------------------------------------------------------------------

export function parseConfig(raw: Record<string, unknown>): GmailConfig {
  const query = typeof raw.query === "string" && raw.query.trim().length > 0 ? raw.query.trim() : DEFAULT_QUERY;
  const labelsRaw = raw.decision_labels;
  let decision_labels: string[] = DEFAULT_DECISION_LABELS;
  if (Array.isArray(labelsRaw)) {
    const cleaned = labelsRaw
      .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
      .map((s) => s.trim());
    if (cleaned.length > 0) decision_labels = cleaned;
  }
  const limitRaw = raw.thread_limit;
  const thread_limit =
    typeof limitRaw === "number" && Number.isInteger(limitRaw) && limitRaw > 0
      ? Math.min(1_000, limitRaw)
      : 200;
  return { query, decision_labels, thread_limit };
}

function parseCursor(raw: string | null): GmailCursor | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as { phase?: unknown; pageToken?: unknown };
    if (o.phase !== "threads" && o.phase !== "done") return null;
    const pageToken = typeof o.pageToken === "string" || o.pageToken === null ? o.pageToken : null;
    return { phase: o.phase, pageToken };
  } catch {
    return null;
  }
}

function stringifyCursor(c: GmailCursor): string {
  return JSON.stringify(c);
}

// --------------------------------------------------------------------------
// Mapper — Gmail thread → MemoryProposals (one thread + zero-or-more contacts)
// --------------------------------------------------------------------------

export function threadToProposals(
  thread: GmailThread,
  decisionLabels: ReadonlySet<string>,
  seenContacts: Set<string>,
): MemoryProposal[] {
  const out: MemoryProposal[] = [];
  const messages = thread.messages ?? [];
  if (messages.length === 0) return out;

  const first = messages[0];
  const last = messages[messages.length - 1];
  const headers = headersOf(last);
  const subject = pickHeader(headers, "Subject") ?? "(no subject)";
  const date =
    last.internalDate && /^\d+$/.test(last.internalDate)
      ? new Date(parseInt(last.internalDate, 10)).toISOString().slice(0, 10)
      : "";

  // Decision when any message in the thread has a pin label.
  const labelIds = new Set<string>();
  for (const m of messages) for (const l of m.labelIds ?? []) labelIds.add(l);
  const isDecision = [...decisionLabels].some((l) => labelIds.has(l));

  const permalink = `https://mail.google.com/mail/u/0/#inbox/${encodeURIComponent(thread.id)}`;
  const snippetBody = (last.snippet ?? first.snippet ?? "").trim();
  const bodyParts: string[] = [];
  if (snippetBody) bodyParts.push(snippetBody);
  if (date) bodyParts.push(`\n_From ${permalink} · ${date}._`);
  else bodyParts.push(`\n_From ${permalink}._`);
  const body = bodyParts.join("\n").trim();

  if (isDecision) {
    out.push({
      type: "decision",
      title: subject.slice(0, 200),
      body,
      fields: {
        decision: subject,
        status: "active",
        decided_on: date || undefined,
        source_ref: thread.id,
        source_permalink: permalink,
        source_kind: "gmail_thread",
      },
      source_ref: `gmail:thread:${thread.id}`,
    });
  } else {
    out.push({
      type: "note",
      title: subject.slice(0, 200),
      body,
      fields: {
        source_ref: thread.id,
        source_permalink: permalink,
        source_kind: "gmail_thread",
      },
      source_ref: `gmail:thread:${thread.id}`,
    });
  }

  // Contacts → team. Walk every message's From / To / Cc.
  for (const m of messages) {
    const h = headersOf(m);
    for (const name of ["From", "To", "Cc"]) {
      const raw = pickHeader(h, name);
      if (!raw) continue;
      for (const c of splitAddressList(raw)) {
        const key = c.email.toLowerCase();
        if (!key || seenContacts.has(key)) continue;
        seenContacts.add(key);
        out.push(contactToProposal(c));
      }
    }
  }

  return out;
}

export type ParsedAddress = { email: string; name: string | null };

/** Parse an RFC-5322 address-list-ish header value. We don't handle quoted
 *  display names with embedded commas (rare in practice); a robust parser
 *  isn't worth the dep here. */
export function splitAddressList(raw: string): ParsedAddress[] {
  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const angle = entry.match(/^(.*)<([^>]+)>$/);
      if (angle) {
        const name = angle[1].trim().replace(/^"|"$/g, "").trim();
        return { email: angle[2].trim(), name: name || null };
      }
      // No display name, just bare email.
      return { email: entry, name: null };
    })
    .filter((a) => /.+@.+/.test(a.email));
}

function contactToProposal(c: ParsedAddress): MemoryProposal {
  const email = c.email;
  const name = c.name ?? email.split("@")[0];
  return {
    type: "team",
    title: name.slice(0, 200),
    body: `From Gmail header. Email: ${email}.`,
    fields: {
      name,
      email,
      role: "",
      source_ref: email,
      source_kind: "gmail_contact",
    },
    source_ref: `gmail:contact:${email.toLowerCase()}`,
  };
}

function headersOf(m: GmailMessage): Array<{ name: string; value: string }> {
  return m.payload?.headers ?? [];
}

function pickHeader(headers: Array<{ name: string; value: string }>, name: string): string | null {
  const found = headers.find((h) => h.name.toLowerCase() === name.toLowerCase());
  return found ? found.value : null;
}

// --------------------------------------------------------------------------
// Error classification + headers
// --------------------------------------------------------------------------

function gmailHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
    "User-Agent": "bbc-connector/0.1",
  };
}

async function asConnectorError(
  res: { status: number; headers: { get: (n: string) => string | null }; text: () => Promise<string> },
  context: string,
): Promise<Error> {
  if (res.status === 401 || res.status === 403) {
    const { AuthExpiredError } = await import("./framework");
    return new AuthExpiredError(`gmail ${res.status} on ${context}`) as AuthExpiredErrorT;
  }
  if (res.status === 429) {
    const { RateLimitError } = await import("./framework");
    const retryAfter = parseInt(res.headers.get("retry-after") ?? "", 10);
    return new RateLimitError(Number.isFinite(retryAfter) ? retryAfter * 1000 : undefined);
  }
  const body = await res.text().catch(() => "");
  return new Error(`gmail ${res.status} on ${context}: ${body.slice(0, 200)}`);
}

function defaultFetchAdapter(): GoogleFetch {
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
