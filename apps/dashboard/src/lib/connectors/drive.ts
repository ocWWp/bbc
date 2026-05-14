// v1.5 D-W5-3: Google Drive connector (OAuth via shared google-oauth helper).
//
// Walks Drive (user + shared drives) and emits MemoryProposals:
//   - Google Docs / Sheets / Slides → `note` (body extracted via export endpoint
//     when the mime supports text/plain; metadata-only otherwise)
//   - PDFs and other binary files → `source_artifact` (no body fetch; the
//     supertag captures "this file IS the memory" — body extraction lives in
//     a downstream worker per Phase I.20 design)
//   - Folders + trashed items are skipped at the list query level
//
// First-sync cap: file_limit = 200 (per launch plan §W5-3). Subsequent syncs
// use the same pageToken-based cursor so cap-induced cutoffs resume cleanly.
//
// Cross-drive support: corpora=allDrives + supportsAllDrives/includeItems...
// so a single connector picks up the user's My Drive AND every shared drive
// they're a member of. The framework's source_ref dedup handles duplicates
// surfaced from multiple drives.
//
// API surface (per https://developers.google.com/drive/api/v3/reference):
//   - GET /drive/v3/files?q=&pageToken=&pageSize=&fields=...&corpora=allDrives
//   - GET /drive/v3/files/{id}/export?mimeType=text/plain  (Google-native only)
//
// HTTP layer is injected; same pattern as gmail + notion + linear.

import type {
  AuthExpiredError as AuthExpiredErrorT,
  AuthURL,
  Connector,
  MemoryProposal,
  SyncContext,
  SyncEvent,
} from "./framework";
import {
  buildAuthorizeUrl,
  buildOAuthState,
  cryptoRandomHex,
  DRIVE_SCOPES,
  refreshAccessToken,
  type GoogleFetch,
} from "./google-oauth";

// --------------------------------------------------------------------------
// Public types
// --------------------------------------------------------------------------

export type DriveConfig = {
  /** Drive `q` parameter. Default excludes folders + trashed items. */
  query: string;
  /** Cap on files per sync (first-sync default: 200). */
  file_limit: number;
  /** Max bytes of exported text to include in a Doc/Sheet/Slide body. */
  body_byte_limit: number;
};

export type DriveCursor = {
  phase: "files" | "done";
  pageToken: string | null;
};

export type DriveConnectorDeps = {
  getToken: (external_account_id: string) => Promise<string>;
  getRefreshToken: (external_account_id: string) => Promise<string>;
  persistRefreshedToken: (
    external_account_id: string,
    tokens: { access_token: string; expires_in: number },
  ) => Promise<void>;
  getOAuthClientCredentials: () => { clientId: string; clientSecret: string };
  getRedirectUri: () => string;
  fetch?: GoogleFetch;
};

// --- Drive API subset --------------------------------------------------------

export type DriveFile = {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
  webViewLink?: string;
  description?: string;
  size?: string;
  driveId?: string;
  parents?: string[];
  owners?: Array<{ displayName?: string; emailAddress?: string }>;
};

type DriveFileList = {
  files?: DriveFile[];
  nextPageToken?: string;
  incompleteSearch?: boolean;
};

// --------------------------------------------------------------------------
// Connector factory
// --------------------------------------------------------------------------

const API_BASE = "https://www.googleapis.com/drive/v3";
const PAGE_SIZE = 100;
const DEFAULT_QUERY = "mimeType != 'application/vnd.google-apps.folder' and trashed = false";
const FILE_FIELDS =
  "files(id,name,mimeType,modifiedTime,webViewLink,description,parents,driveId,size,owners(displayName,emailAddress)),nextPageToken,incompleteSearch";

// MIME types that Drive's /export endpoint can render as text, mapped to the
// export mimeType we ask for. Docs/Slides export cleanly to text/plain; Sheets
// requires text/csv (text/plain returns 400). Codex [P2] flagged the
// uniform text/plain assumption silently degrading Sheets to metadata-only.
const TEXT_EXPORT_MIME_BY_NATIVE: Readonly<Record<string, string>> = {
  "application/vnd.google-apps.document": "text/plain",
  "application/vnd.google-apps.spreadsheet": "text/csv",
  "application/vnd.google-apps.presentation": "text/plain",
};

export function createDriveConnector(deps: DriveConnectorDeps): Connector {
  const fetchImpl: GoogleFetch = deps.fetch ?? defaultFetchAdapter();

  async function driveGet<T>(token: string, path: string, query: Record<string, string>, context: string): Promise<T> {
    const url = new URL(`${API_BASE}${path}`);
    for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
    const res = await fetchImpl(url.toString(), { headers: driveHeaders(token) });
    if (!res.ok) throw await asConnectorError(res, context);
    return (await res.json()) as T;
  }

  async function driveGetText(token: string, path: string, query: Record<string, string>, byteLimit: number, context: string): Promise<string> {
    const url = new URL(`${API_BASE}${path}`);
    for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
    const res = await fetchImpl(url.toString(), { headers: driveHeaders(token) });
    if (!res.ok) throw await asConnectorError(res, context);
    const text = await res.text();
    return text.length > byteLimit ? text.slice(0, byteLimit) : text;
  }

  async function* iterateFiles(
    token: string,
    query: string,
    startPageToken: string | null,
    limit: number,
  ): AsyncGenerator<{ file: DriveFile; pageToken: string | null; isPageBoundary: boolean }, void, unknown> {
    let pageToken: string | null = startPageToken;
    let yielded = 0;
    while (yielded < limit) {
      const params: Record<string, string> = {
        q: query,
        pageSize: String(Math.min(PAGE_SIZE, limit - yielded)),
        corpora: "allDrives",
        includeItemsFromAllDrives: "true",
        supportsAllDrives: "true",
        fields: FILE_FIELDS,
        orderBy: "modifiedTime desc",
      };
      if (pageToken) params.pageToken = pageToken;
      const data = await driveGet<DriveFileList>(token, "/files", params, "files.list");
      const files = data.files ?? [];
      const nextPageToken: string | null = data.nextPageToken ?? null;
      for (let i = 0; i < files.length; i++) {
        const isLast = i === files.length - 1;
        yield { file: files[i], pageToken: isLast ? nextPageToken : null, isPageBoundary: isLast };
        yielded++;
        if (yielded >= limit) return;
      }
      if (!nextPageToken) return;
      pageToken = nextPageToken;
    }
  }

  return {
    id: "drive",
    name: "Google Drive",
    description:
      "Sync Google Drive (your drive + shared drives). Google Docs/Sheets/Slides become notes; PDFs and binary files become source artifacts.",
    writes_to: ["note", "source_artifact"],
    oauth_scopes: [...DRIVE_SCOPES],
    permission_summary:
      "Reads files in My Drive and shared drives you can see. Google-native files are exported as text; binary files are metadata-only. No writes.",

    async authenticate(tenant_id, redirect_url): Promise<AuthURL> {
      const { clientId } = deps.getOAuthClientCredentials();
      const state = buildOAuthState({ tenant_id, provider: "drive", nonce: cryptoRandomHex(16) });
      const url = buildAuthorizeUrl({
        clientId,
        redirectUri: redirect_url,
        scopes: DRIVE_SCOPES,
        state,
      });
      return { url, state };
    },

    async complete_auth(_tenant_id, _code): Promise<{ external_account_id: string }> {
      throw new Error(
        "drive.complete_auth must be called from the install server action: " +
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
        throw new Error("drive connector: missing external_account_id");
      }
      const token = await deps.getToken(ctx.external_account_id);
      const cfg = parseConfig(ctx.config);
      const parsed = parseCursor(ctx.cursor);
      const startPageToken = !parsed || parsed.phase === "done" ? null : parsed.pageToken;

      let lastEmittedPageToken: string | null = null;
      let hasMore = false;
      for await (const { file, pageToken, isPageBoundary } of iterateFiles(token, cfg.query, startPageToken, cfg.file_limit)) {
        // For Google-native exportable files, try to pull a text body. Soft
        // fail on a single file — emit a metadata-only proposal so the user
        // can still see it.
        let body = "";
        const exportMime = TEXT_EXPORT_MIME_BY_NATIVE[file.mimeType];
        if (exportMime) {
          try {
            // Codex [P1]: /files/{id}/export only accepts `mimeType` (plus
            // standard auth headers). Passing supportsAllDrives here returns
            // 400 and the surrounding catch silently degrades every Doc/
            // Slide to metadata-only. Shared-drive access is determined by
            // the file ID + permissions; no flag needed on this endpoint.
            body = await driveGetText(
              token,
              `/files/${encodeURIComponent(file.id)}/export`,
              { mimeType: exportMime },
              cfg.body_byte_limit,
              `files.export ${file.id}`,
            );
          } catch (err) {
            const e = err as Error;
            if (e.name === "RateLimitError" || e.name === "AuthExpiredError") throw e;
            // Otherwise: silently fall through to metadata-only.
          }
        }
        yield { kind: "proposal", proposal: fileToProposal(file, body) };
        if (isPageBoundary) {
          lastEmittedPageToken = pageToken;
          if (pageToken) {
            hasMore = true;
            yield { kind: "checkpoint", cursor: stringifyCursor({ phase: "files", pageToken }) };
          }
        }
      }

      if (hasMore && lastEmittedPageToken) {
        // We hit file_limit mid-sweep; stay in files phase so next sync resumes.
        yield { kind: "checkpoint", cursor: stringifyCursor({ phase: "files", pageToken: lastEmittedPageToken }) };
        return;
      }
      yield { kind: "checkpoint", cursor: stringifyCursor({ phase: "done", pageToken: null }) };
    },

    sync_schedule: { interval_minutes: 60 },
    max_proposals_per_sync: 200,
    rate_limit_strategy: { base_delay_ms: 1_000, max_delay_ms: 60_000, max_retries: 3 },
  };
}

// --------------------------------------------------------------------------
// Config + cursor helpers
// --------------------------------------------------------------------------

export function parseConfig(raw: Record<string, unknown>): DriveConfig {
  const query = typeof raw.query === "string" && raw.query.trim().length > 0 ? raw.query.trim() : DEFAULT_QUERY;
  const limitRaw = raw.file_limit;
  const file_limit =
    typeof limitRaw === "number" && Number.isInteger(limitRaw) && limitRaw > 0
      ? Math.min(2_000, limitRaw)
      : 200;
  const bodyRaw = raw.body_byte_limit;
  const body_byte_limit =
    typeof bodyRaw === "number" && Number.isInteger(bodyRaw) && bodyRaw > 0
      ? Math.min(1_000_000, bodyRaw)
      : 100_000;
  return { query, file_limit, body_byte_limit };
}

function parseCursor(raw: string | null): DriveCursor | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as { phase?: unknown; pageToken?: unknown };
    if (o.phase !== "files" && o.phase !== "done") return null;
    const pageToken = typeof o.pageToken === "string" || o.pageToken === null ? o.pageToken : null;
    return { phase: o.phase, pageToken };
  } catch {
    return null;
  }
}

function stringifyCursor(c: DriveCursor): string {
  return JSON.stringify(c);
}

// --------------------------------------------------------------------------
// Mapper — Drive file → MemoryProposal
// --------------------------------------------------------------------------

export function fileToProposal(file: DriveFile, bodyText: string): MemoryProposal {
  const permalink = file.webViewLink ?? `https://drive.google.com/file/d/${encodeURIComponent(file.id)}/view`;
  const isNative = file.mimeType.startsWith("application/vnd.google-apps.");
  const modifiedDate = file.modifiedTime?.slice(0, 10) ?? "";
  const tailer = `\n_From ${permalink}${modifiedDate ? ` · modified ${modifiedDate}` : ""}._`;

  if (isNative) {
    const body = (bodyText || file.description || "").trim();
    return {
      type: "note",
      title: (file.name || "Untitled").slice(0, 200),
      body: (body + tailer).trim(),
      fields: {
        source_ref: file.id,
        source_permalink: permalink,
        source_kind: driveSourceKind(file.mimeType),
        topic: friendlyMime(file.mimeType),
      },
      source_ref: `drive:file:${file.id}`,
    };
  }

  // PDFs / binary → source_artifact. The supertag is "this file IS the
  // memory"; downstream extraction worker (post-v1.5) can fill in summary.
  return {
    type: "source_artifact",
    title: (file.name || "Untitled").slice(0, 200),
    body: (file.description || "").trim() + tailer,
    fields: {
      source_kind: "url",
      url: permalink,
      filename: file.name,
      snapshot_at: modifiedDate || undefined,
      summary: file.description?.slice(0, 2000) ?? "",
    },
    source_ref: `drive:file:${file.id}`,
  };
}

function driveSourceKind(mime: string): string {
  switch (mime) {
    case "application/vnd.google-apps.document":
      return "google_doc";
    case "application/vnd.google-apps.spreadsheet":
      return "google_sheet";
    case "application/vnd.google-apps.presentation":
      return "google_slides";
    default:
      return mime;
  }
}

function friendlyMime(mime: string): string {
  switch (mime) {
    case "application/vnd.google-apps.document":
      return "Google Doc";
    case "application/vnd.google-apps.spreadsheet":
      return "Google Sheet";
    case "application/vnd.google-apps.presentation":
      return "Google Slides";
    case "application/pdf":
      return "PDF";
    default:
      return mime;
  }
}

// --------------------------------------------------------------------------
// Errors + headers
// --------------------------------------------------------------------------

function driveHeaders(token: string): Record<string, string> {
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
    return new AuthExpiredError(`drive ${res.status} on ${context}`) as AuthExpiredErrorT;
  }
  if (res.status === 429) {
    const { RateLimitError } = await import("./framework");
    const retryAfter = parseInt(res.headers.get("retry-after") ?? "", 10);
    return new RateLimitError(Number.isFinite(retryAfter) ? retryAfter * 1000 : undefined);
  }
  const body = await res.text().catch(() => "");
  return new Error(`drive ${res.status} on ${context}: ${body.slice(0, 200)}`);
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
