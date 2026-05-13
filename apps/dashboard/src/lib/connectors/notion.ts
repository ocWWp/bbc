// v1.5 D-W3-2: Notion connector (OAuth).
//
// Walks all pages the integration has access to and emits MemoryProposals.
//
// Mapping (per design §4):
//   - Page property `type: decision` (string)        → memory_files.type = 'decision'
//   - Page property `type: glossary | product | …`   → matching supertag
//   - Page with no `type` property                    → memory_files.type = 'note'
//   - Property `Title` (or page.title)               → memory_files.title
//   - Property `Date` (date type)                    → fields.decision_date (decision only)
//   - Markdown rendering of page blocks              → memory_files.body
//
// OAuth: Notion v2 issues non-expiring access tokens (no refresh flow). The
// token is stored in external_accounts as the connector secret. authenticate()
// returns the standard Notion oauth/authorize URL; complete_auth() exchanges
// the code at /v1/oauth/token using Basic-auth'd client credentials.
//
// Cursor: Notion's search endpoint supports an opaque `start_cursor` string;
// we persist that verbatim in tenant_connectors.sync_state.cursor. A `null`
// cursor means "start a fresh search from the beginning".
//
// HTTP layer is injected (NotionFetch port) so the connector is fully unit-
// testable without hitting api.notion.com. Production wires globalThis.fetch.

import type {
  Connector,
  AuthURL,
  MemoryProposal,
  SyncContext,
  SyncEvent,
} from "./framework";
import type { Supertag } from "@/lib/memory/types";

// --------------------------------------------------------------------------
// Public types
// --------------------------------------------------------------------------

export type NotionConfig = {
  /** Optional override of which Notion property name maps to BBC supertag.
   *  Default: "type". The value of this property (string) must be one of
   *  the SUPERTAG values to be honored; anything else → note. */
  type_property: string;
  /** Optional override of which Notion property name carries the page title.
   *  Default: looks for `title` type first, then falls back to page.title. */
  title_property: string | null;
  /** Cap the number of pages we extract content for per sync, on top of the
   *  framework's max_proposals_per_sync. Useful for very large workspaces. */
  page_size: number;
};

export type NotionFetch = (
  url: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string },
) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
  text: () => Promise<string>;
  headers: { get: (name: string) => string | null };
}>;

export type NotionConnectorDeps = {
  /** Resolve the OAuth access token from external_accounts (decrypts ciphertext). */
  getToken: (external_account_id: string) => Promise<string>;
  /** Notion-specific Basic-auth header for the /v1/oauth/token exchange.
   *  Production: built from BBC_NOTION_CLIENT_ID + BBC_NOTION_CLIENT_SECRET.
   *  Tests: injected directly. Format: `Basic <base64(clientId:secret)>`. */
  getOAuthBasicHeader: () => string;
  fetch?: NotionFetch;
};

// Subset of Notion API response shapes we touch.
type NotionPage = {
  object: "page";
  id: string;
  url: string;
  archived?: boolean;
  properties: Record<string, NotionProperty>;
  last_edited_time?: string;
};

type NotionProperty =
  | { type: "title"; title: { plain_text: string }[] }
  | { type: "rich_text"; rich_text: { plain_text: string }[] }
  | { type: "select"; select: { name: string } | null }
  | { type: "multi_select"; multi_select: { name: string }[] }
  | { type: "status"; status: { name: string } | null }
  | { type: "date"; date: { start: string; end: string | null } | null }
  | { type: "url"; url: string | null }
  | { type: "checkbox"; checkbox: boolean }
  | { type: "number"; number: number | null }
  // Permissive catch-all for property types we don't model.
  | { type: string; [k: string]: unknown };

type NotionSearchResponse = {
  object: "list";
  results: NotionPage[];
  has_more: boolean;
  next_cursor: string | null;
};

type NotionBlock = {
  object: "block";
  id: string;
  type: string;
  has_children: boolean;
  [k: string]: unknown;
};

type NotionBlockChildrenResponse = {
  object: "list";
  results: NotionBlock[];
  has_more: boolean;
  next_cursor: string | null;
};

// --------------------------------------------------------------------------
// Public factory
// --------------------------------------------------------------------------

const SUPERTAG_VALUES: ReadonlySet<string> = new Set([
  "voice", "decision", "glossary", "vendor", "product", "team", "skill", "source_artifact", "note",
]);

const PAGE_SEARCH_PAGE_SIZE = 50;
const NOTION_VERSION = "2022-06-28";
const PREVIEW_SAMPLE_SIZE = 10;

export function createNotionConnector(deps: NotionConnectorDeps): Connector & {
  preview: (ctx: SyncContext) => Promise<MemoryProposal[]>;
} {
  const fetchImpl: NotionFetch = deps.fetch ?? defaultFetchAdapter();

  async function* iterateSearch(token: string, startCursor: string | null, limit: number): AsyncGenerator<{ page: NotionPage; cursor: string | null }, void, unknown> {
    let cursor = startCursor;
    let yielded = 0;
    while (yielded < limit) {
      const body: Record<string, unknown> = {
        filter: { value: "page", property: "object" },
        page_size: Math.min(PAGE_SEARCH_PAGE_SIZE, limit - yielded),
      };
      if (cursor) body.start_cursor = cursor;
      const res = await fetchImpl("https://api.notion.com/v1/search", {
        method: "POST",
        headers: notionHeaders(token),
        body: JSON.stringify(body),
      });
      if (!res.ok) throw await asConnectorError(res, "search");
      const data = (await res.json()) as NotionSearchResponse;
      for (const page of data.results) {
        if (page.archived) continue;
        cursor = data.has_more ? data.next_cursor : null;
        yield { page, cursor };
        yielded++;
        if (yielded >= limit) return;
      }
      if (!data.has_more) return;
      cursor = data.next_cursor;
    }
  }

  async function fetchPageBlocks(token: string, pageId: string): Promise<NotionBlock[]> {
    const out: NotionBlock[] = [];
    let cursor: string | null = null;
    let safety = 5; // cap at ~500 blocks per page to bound sync cost
    while (safety-- > 0) {
      const params = new URLSearchParams({ page_size: "100" });
      if (cursor) params.set("start_cursor", cursor);
      const res = await fetchImpl(`https://api.notion.com/v1/blocks/${encodeURIComponent(pageId)}/children?${params.toString()}`, {
        headers: notionHeaders(token),
      });
      if (!res.ok) throw await asConnectorError(res, `blocks ${pageId}`);
      const data = (await res.json()) as NotionBlockChildrenResponse;
      out.push(...data.results);
      if (!data.has_more || !data.next_cursor) break;
      cursor = data.next_cursor;
    }
    return out;
  }

  return {
    id: "notion",
    name: "Notion",
    description: "Sync workspace pages as typed memory. Properties drive supertag mapping; page bodies render to markdown.",
    writes_to: ["decision", "note", "glossary", "product"],
    oauth_scopes: [],
    permission_summary: "Reads all pages the BBC integration is added to. No writes.",

    async authenticate(tenant_id, redirect_url): Promise<AuthURL> {
      const state = `tenant=${encodeURIComponent(tenant_id)};nonce=${cryptoRandomHex(16)}`;
      const clientId = process.env.BBC_NOTION_CLIENT_ID ?? "";
      const url = new URL("https://api.notion.com/v1/oauth/authorize");
      url.searchParams.set("client_id", clientId);
      url.searchParams.set("response_type", "code");
      url.searchParams.set("owner", "user");
      url.searchParams.set("redirect_uri", redirect_url);
      url.searchParams.set("state", state);
      return { url: url.toString(), state };
    },

    async complete_auth(_tenant_id, code): Promise<{ external_account_id: string }> {
      const res = await fetchImpl("https://api.notion.com/v1/oauth/token", {
        method: "POST",
        headers: {
          Authorization: deps.getOAuthBasicHeader(),
          "Content-Type": "application/json",
          "Notion-Version": NOTION_VERSION,
        },
        body: JSON.stringify({
          grant_type: "authorization_code",
          code,
          redirect_uri: process.env.BBC_NOTION_REDIRECT_URI ?? "",
        }),
      });
      if (!res.ok) throw await asConnectorError(res, "oauth token exchange");
      // Caller (the install server action) takes the response body, encrypts
      // the access_token, writes the external_accounts row, and returns its
      // id. We can't do that here without coupling this module to Supabase.
      throw new Error(
        "notion.complete_auth must be called from the install server action: " +
        "it receives the token-exchange response and persists it via external_accounts.",
      );
    },

    async preview(ctx: SyncContext): Promise<MemoryProposal[]> {
      if (!ctx.external_account_id) throw new Error("notion preview: missing external_account_id");
      const token = await deps.getToken(ctx.external_account_id);
      const cfg = parseConfig(ctx.config);
      const out: MemoryProposal[] = [];
      for await (const { page } of iterateSearch(token, null, PREVIEW_SAMPLE_SIZE)) {
        out.push(pageToProposal(cfg, page, ""));
        if (out.length >= PREVIEW_SAMPLE_SIZE) break;
      }
      return out;
    },

    async *sync(ctx: SyncContext): AsyncIterable<SyncEvent> {
      if (!ctx.external_account_id) {
        throw new Error("notion connector: missing external_account_id");
      }
      const token = await deps.getToken(ctx.external_account_id);
      const cfg = parseConfig(ctx.config);
      const limit = cfg.page_size;

      let pageCount = 0;
      for await (const { page, cursor } of iterateSearch(token, ctx.cursor, limit)) {
        // Fetch + render the page body. Empty/errored body yields a proposal
        // with empty body (still useful as a metadata draft in /queue).
        let bodyMd = "";
        try {
          const blocks = await fetchPageBlocks(token, page.id);
          bodyMd = blocksToMarkdown(blocks);
        } catch (err) {
          const e = err as Error;
          if (e.name === "RateLimitError" || e.name === "AuthExpiredError") throw e;
          // Soft fail on a single page — emit a metadata-only proposal so the
          // user can still see what's there.
        }
        yield { kind: "proposal", proposal: pageToProposal(cfg, page, bodyMd) };
        pageCount++;
        // Checkpoint every 5 pages so a mid-sync error keeps recent progress.
        if (pageCount % 5 === 0) {
          yield { kind: "checkpoint", cursor };
        }
      }
      // Final checkpoint — null marks "fully drained".
      yield { kind: "checkpoint", cursor: null };
    },

    sync_schedule: { interval_minutes: 60 },
    max_proposals_per_sync: 200,
    rate_limit_strategy: { base_delay_ms: 1_000, max_delay_ms: 60_000, max_retries: 3 },
  };
}

// --------------------------------------------------------------------------
// Config + mappers
// --------------------------------------------------------------------------

export function parseConfig(raw: Record<string, unknown>): NotionConfig {
  return {
    type_property: typeof raw.type_property === "string" && raw.type_property ? raw.type_property : "type",
    title_property: typeof raw.title_property === "string" && raw.title_property ? raw.title_property : null,
    page_size: typeof raw.page_size === "number" && Number.isInteger(raw.page_size) && raw.page_size > 0
      ? Math.min(500, raw.page_size)
      : 200,
  };
}

export function pageToProposal(cfg: NotionConfig, page: NotionPage, bodyMd: string): MemoryProposal {
  const type = resolveSupertag(cfg, page);
  const title = resolveTitle(cfg, page);
  const fields: Record<string, unknown> = {
    source_ref: page.id,
    source_permalink: page.url,
    source_kind: "notion_page",
  };
  // Decision-only enrichment from a Date property, if present.
  if (type === "decision") {
    const date = pickDateProperty(page);
    if (date) fields.decision_date = date;
  }
  return {
    type,
    title: (title || "Untitled").slice(0, 200),
    body: bodyMd,
    fields,
    source_ref: `notion:${page.id}`,
  };
}

function resolveSupertag(cfg: NotionConfig, page: NotionPage): Supertag {
  const prop = page.properties[cfg.type_property];
  if (!prop) return "note";
  const v = readStringProperty(prop);
  if (v && SUPERTAG_VALUES.has(v)) return v as Supertag;
  return "note";
}

function resolveTitle(cfg: NotionConfig, page: NotionPage): string {
  if (cfg.title_property && page.properties[cfg.title_property]) {
    const t = readStringProperty(page.properties[cfg.title_property]);
    if (t) return t;
  }
  // Fall back to whatever property has type='title'.
  for (const key of Object.keys(page.properties)) {
    const p = page.properties[key];
    if (p && p.type === "title" && Array.isArray((p as { title: { plain_text: string }[] }).title)) {
      const parts = (p as { title: { plain_text: string }[] }).title.map((t) => t.plain_text).join("");
      if (parts) return parts;
    }
  }
  return "";
}

function readStringProperty(prop: NotionProperty): string | null {
  switch (prop.type) {
    case "title": {
      const arr = (prop as { title: { plain_text: string }[] }).title;
      return Array.isArray(arr) ? arr.map((t) => t.plain_text).join("") : null;
    }
    case "rich_text": {
      const arr = (prop as { rich_text: { plain_text: string }[] }).rich_text;
      return Array.isArray(arr) ? arr.map((t) => t.plain_text).join("") : null;
    }
    case "select": {
      const s = (prop as { select: { name: string } | null }).select;
      return s?.name ?? null;
    }
    case "status": {
      const s = (prop as { status: { name: string } | null }).status;
      return s?.name ?? null;
    }
    case "url": {
      return (prop as { url: string | null }).url;
    }
    default:
      return null;
  }
}

function pickDateProperty(page: NotionPage): string | null {
  for (const key of Object.keys(page.properties)) {
    const p = page.properties[key];
    if (p && p.type === "date") {
      const d = (p as { date: { start: string } | null }).date;
      if (d?.start) return d.start;
    }
  }
  return null;
}

// --------------------------------------------------------------------------
// Block → markdown (minimal subset; covers the common cases for v1.5)
// --------------------------------------------------------------------------

export function blocksToMarkdown(blocks: NotionBlock[]): string {
  const lines: string[] = [];
  for (const b of blocks) {
    const text = readBlockText(b);
    switch (b.type) {
      case "paragraph":
        if (text) lines.push(text);
        break;
      case "heading_1":
        lines.push(`# ${text}`);
        break;
      case "heading_2":
        lines.push(`## ${text}`);
        break;
      case "heading_3":
        lines.push(`### ${text}`);
        break;
      case "bulleted_list_item":
        lines.push(`- ${text}`);
        break;
      case "numbered_list_item":
        lines.push(`1. ${text}`);
        break;
      case "quote":
        lines.push(`> ${text}`);
        break;
      case "code": {
        const lang = (b as { code?: { language?: string } }).code?.language ?? "";
        lines.push("```" + lang);
        lines.push(text);
        lines.push("```");
        break;
      }
      case "to_do": {
        const checked = (b as { to_do?: { checked?: boolean } }).to_do?.checked === true;
        lines.push(`- [${checked ? "x" : " "}] ${text}`);
        break;
      }
      case "divider":
        lines.push("---");
        break;
      default:
        // Unknown block type: include the text if there's any so we don't
        // silently drop content. Better to have noisy markdown than a half
        // page.
        if (text) lines.push(text);
    }
  }
  return lines.join("\n");
}

function readBlockText(block: NotionBlock): string {
  const inner = (block as Record<string, unknown>)[block.type] as
    | { rich_text?: { plain_text: string }[] }
    | undefined;
  const rt = inner?.rich_text;
  if (!Array.isArray(rt)) return "";
  return rt.map((t) => t.plain_text ?? "").join("");
}

// --------------------------------------------------------------------------
// Error classification + headers + helpers
// --------------------------------------------------------------------------

function notionHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    "Notion-Version": NOTION_VERSION,
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
    return new AuthExpiredError(`notion ${res.status} on ${context}`);
  }
  if (res.status === 429) {
    const { RateLimitError } = await import("./framework");
    const retryAfter = parseInt(res.headers.get("retry-after") ?? "", 10);
    return new RateLimitError(Number.isFinite(retryAfter) ? retryAfter * 1000 : undefined);
  }
  const body = await res.text().catch(() => "");
  return new Error(`notion ${res.status} on ${context}: ${body.slice(0, 200)}`);
}

function cryptoRandomHex(bytes: number): string {
  // Avoid pulling node:crypto into this module — Cloudflare Workers exposes
  // globalThis.crypto. Random state for the OAuth `state` param is sufficient.
  const arr = new Uint8Array(bytes);
  globalThis.crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}

function defaultFetchAdapter(): NotionFetch {
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
