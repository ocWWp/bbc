// D-W5-3 tests for the Drive connector.

import { describe, expect, it } from "vitest";
import {
  createDriveConnector,
  fileToProposal,
  parseConfig,
  type DriveConnectorDeps,
  type DriveFile,
} from "./drive";
import type { GoogleFetch } from "./google-oauth";
import type { MemoryProposal, SyncContext, SyncEvent } from "./framework";

type Resp = { ok: boolean; status: number; body?: unknown; text?: string; headers?: Record<string, string> };

function mockDriveFetch(
  routes: {
    filesList?: (url: URL) => Resp;
    fileExport?: (id: string, url: URL) => Resp;
    tokenRefresh?: () => Resp;
  },
): { fetch: GoogleFetch; calls: { url: string }[] } {
  const calls: { url: string }[] = [];
  const fetchImpl: GoogleFetch = async (url) => {
    calls.push({ url });
    const u = new URL(url);
    let r: Resp;
    if (u.host === "www.googleapis.com" && /\/drive\/v3\/files\/[^/]+\/export$/.test(u.pathname)) {
      const id = decodeURIComponent(u.pathname.split("/files/")[1].split("/export")[0]);
      r = routes.fileExport ? routes.fileExport(id, u) : { ok: false, status: 500 };
    } else if (u.host === "www.googleapis.com" && u.pathname === "/drive/v3/files") {
      r = routes.filesList ? routes.filesList(u) : { ok: false, status: 500 };
    } else if (u.host === "oauth2.googleapis.com") {
      r = routes.tokenRefresh ? routes.tokenRefresh() : { ok: false, status: 500 };
    } else {
      r = { ok: false, status: 404, body: "no route" };
    }
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

const okBody = (body: unknown): Resp => ({ ok: true, status: 200, body });
const okText = (text: string): Resp => ({ ok: true, status: 200, text });

function baseDeps(fetchImpl: GoogleFetch, over: Partial<DriveConnectorDeps> = {}): DriveConnectorDeps {
  return {
    getToken: async () => "access_test",
    getRefreshToken: async () => "refresh_test",
    persistRefreshedToken: async () => undefined,
    getOAuthClientCredentials: () => ({ clientId: "cid", clientSecret: "csec" }),
    getRedirectUri: () => "https://bbc.example/cb",
    fetch: fetchImpl,
    ...over,
  };
}

function syncCtx(over: Partial<SyncContext> = {}): SyncContext {
  return { tenant_id: "t1", external_account_id: "ext_drive", cursor: null, config: {}, ...over };
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
// Mapper
// --------------------------------------------------------------------------

describe("fileToProposal", () => {
  it("Google Doc → note with extracted body + permalink", () => {
    const file: DriveFile = {
      id: "doc1",
      name: "Launch plan",
      mimeType: "application/vnd.google-apps.document",
      modifiedTime: "2026-05-12T10:00:00.000Z",
      webViewLink: "https://docs.google.com/document/d/doc1/view",
    };
    const p = fileToProposal(file, "The launch plan body…");
    expect(p.type).toBe("note");
    expect(p.title).toBe("Launch plan");
    expect(p.body).toContain("The launch plan body");
    expect(p.body).toContain("https://docs.google.com/document/d/doc1/view");
    expect(p.body).toContain("modified 2026-05-12");
    expect(p.source_ref).toBe("drive:file:doc1");
    expect(p.fields).toMatchObject({
      source_kind: "google_doc",
      source_permalink: "https://docs.google.com/document/d/doc1/view",
      topic: "Google Doc",
    });
  });

  it("PDF → source_artifact (no body fetch)", () => {
    const file: DriveFile = {
      id: "pdf1",
      name: "Investor deck.pdf",
      mimeType: "application/pdf",
      modifiedTime: "2026-04-30T00:00:00.000Z",
      webViewLink: "https://drive.google.com/file/d/pdf1/view",
      description: "Q2 board deck",
    };
    const p = fileToProposal(file, "");
    expect(p.type).toBe("source_artifact");
    expect(p.title).toBe("Investor deck.pdf");
    expect(p.fields).toMatchObject({
      source_kind: "url",
      url: "https://drive.google.com/file/d/pdf1/view",
      filename: "Investor deck.pdf",
      snapshot_at: "2026-04-30",
      summary: "Q2 board deck",
    });
    expect(p.source_ref).toBe("drive:file:pdf1");
  });

  it("Google Sheet → note (exportable)", () => {
    const file: DriveFile = {
      id: "sh1",
      name: "Pricing",
      mimeType: "application/vnd.google-apps.spreadsheet",
    };
    const p = fileToProposal(file, "col1,col2\n1,2");
    expect(p.type).toBe("note");
    expect(p.body).toContain("col1,col2");
    expect(p.fields.source_kind).toBe("google_sheet");
  });

  it("requests text/csv for Sheets and text/plain for Docs (codex [P2])", async () => {
    // This pure-fileToProposal test pairs with the sync-level test below that
    // verifies the export URL carries the right mimeType per native type.
    const docs: DriveFile = { id: "d1", name: "D", mimeType: "application/vnd.google-apps.document" };
    expect(fileToProposal(docs, "doc body").body).toContain("doc body");
    const sheet: DriveFile = { id: "s1", name: "S", mimeType: "application/vnd.google-apps.spreadsheet" };
    expect(fileToProposal(sheet, "a,b\n1,2").body).toContain("a,b");
  });

  it("synthesizes a Drive permalink when webViewLink is missing", () => {
    const file: DriveFile = { id: "x1", name: "x", mimeType: "image/png" };
    const p = fileToProposal(file, "");
    expect((p.fields.url as string) ?? "").toContain("drive.google.com/file/d/x1/view");
  });
});

// --------------------------------------------------------------------------
// Config + manifest
// --------------------------------------------------------------------------

describe("parseConfig", () => {
  it("defaults exclude folders + trashed", () => {
    const cfg = parseConfig({});
    expect(cfg.query).toContain("folder");
    expect(cfg.query).toContain("trashed");
    expect(cfg.file_limit).toBe(200);
    expect(cfg.body_byte_limit).toBe(100_000);
  });

  it("caps file_limit and body_byte_limit", () => {
    const cfg = parseConfig({ file_limit: 99_999, body_byte_limit: 99_999_999 });
    expect(cfg.file_limit).toBe(2_000);
    expect(cfg.body_byte_limit).toBe(1_000_000);
  });
});

describe("connector manifest", () => {
  it("writes_to matches the mapper", () => {
    const { fetch } = mockDriveFetch({});
    const c = createDriveConnector(baseDeps(fetch));
    expect(c.writes_to.sort()).toEqual(["note", "source_artifact"]);
  });
});

// --------------------------------------------------------------------------
// Authenticate
// --------------------------------------------------------------------------

describe("authenticate", () => {
  it("builds a Google OAuth URL scoped to drive.readonly + metadata.readonly", async () => {
    const { fetch } = mockDriveFetch({});
    const c = createDriveConnector(baseDeps(fetch));
    const { url, state } = await c.authenticate("t1", "https://bbc.example/cb");
    const u = new URL(url);
    const scope = u.searchParams.get("scope")!;
    expect(scope).toContain("drive.readonly");
    expect(scope).toContain("drive.metadata.readonly");
    expect(state).toContain("provider=drive");
  });
});

// --------------------------------------------------------------------------
// Refresh
// --------------------------------------------------------------------------

describe("refresh_token", () => {
  it("refreshes via shared oauth helper + persists the new token", async () => {
    let persisted: { access_token: string; expires_in: number } | null = null;
    const { fetch } = mockDriveFetch({
      tokenRefresh: () => okBody({ access_token: "new_at", expires_in: 3599, token_type: "Bearer", scope: "https://www.googleapis.com/auth/drive.readonly" }),
    });
    const c = createDriveConnector(
      baseDeps(fetch, {
        persistRefreshedToken: async (_id, tokens) => {
          persisted = tokens;
        },
      }),
    );
    await c.refresh_token!("ext_drive");
    expect(persisted).toEqual({ access_token: "new_at", expires_in: 3599 });
  });
});

// --------------------------------------------------------------------------
// Sync
// --------------------------------------------------------------------------

describe("sync", () => {
  it("walks files.list → emits note for Docs + source_artifact for PDFs", async () => {
    const { fetch } = mockDriveFetch({
      filesList: () =>
        okBody({
          files: [
            { id: "doc1", name: "Doc", mimeType: "application/vnd.google-apps.document", modifiedTime: "2026-05-01T00:00:00Z" },
            { id: "pdf1", name: "Slide.pdf", mimeType: "application/pdf", modifiedTime: "2026-05-02T00:00:00Z" },
          ],
        }),
      fileExport: () => okText("exported doc text"),
    });
    const c = createDriveConnector(baseDeps(fetch));
    const events = await collect(c.sync(syncCtx()));
    const props = proposalsOf(events);
    const byRef = Object.fromEntries(props.map((p) => [p.source_ref, p]));
    expect(byRef["drive:file:doc1"].type).toBe("note");
    expect(byRef["drive:file:doc1"].body).toContain("exported doc text");
    expect(byRef["drive:file:pdf1"].type).toBe("source_artifact");
  });

  it("lists across allDrives (corpora + supportsAllDrives flags)", async () => {
    let listUrl: URL | null = null;
    const { fetch } = mockDriveFetch({
      filesList: (url) => {
        listUrl = url;
        return okBody({ files: [] });
      },
    });
    const c = createDriveConnector(baseDeps(fetch));
    await collect(c.sync(syncCtx()));
    expect(listUrl!.searchParams.get("corpora")).toBe("allDrives");
    expect(listUrl!.searchParams.get("includeItemsFromAllDrives")).toBe("true");
    expect(listUrl!.searchParams.get("supportsAllDrives")).toBe("true");
  });

  it("export call uses text/csv for Sheets, text/plain for Docs/Slides (codex [P2])", async () => {
    const exportMimes: Record<string, string | null> = {};
    const { fetch } = mockDriveFetch({
      filesList: () =>
        okBody({
          files: [
            { id: "doc1", name: "Doc", mimeType: "application/vnd.google-apps.document" },
            { id: "sheet1", name: "Sheet", mimeType: "application/vnd.google-apps.spreadsheet" },
            { id: "slides1", name: "Slides", mimeType: "application/vnd.google-apps.presentation" },
          ],
        }),
      fileExport: (id, url) => {
        exportMimes[id] = url.searchParams.get("mimeType");
        return okText("body");
      },
    });
    const c = createDriveConnector(baseDeps(fetch));
    await collect(c.sync(syncCtx()));
    expect(exportMimes).toEqual({ doc1: "text/plain", sheet1: "text/csv", slides1: "text/plain" });
  });

  it("export call does NOT include supportsAllDrives (codex [P1])", async () => {
    let exportUrl: URL | null = null;
    const { fetch } = mockDriveFetch({
      filesList: () => okBody({ files: [{ id: "doc1", name: "D", mimeType: "application/vnd.google-apps.document" }] }),
      fileExport: (_id, url) => {
        exportUrl = url;
        return okText("body");
      },
    });
    const c = createDriveConnector(baseDeps(fetch));
    await collect(c.sync(syncCtx()));
    expect(exportUrl!.searchParams.get("supportsAllDrives")).toBeNull();
    expect(Array.from(exportUrl!.searchParams.keys())).toEqual(["mimeType"]);
  });

  it("does not call export for non-Google-native files (PDF)", async () => {
    let exportCalled = false;
    const { fetch } = mockDriveFetch({
      filesList: () => okBody({ files: [{ id: "pdf1", name: "x.pdf", mimeType: "application/pdf" }] }),
      fileExport: () => {
        exportCalled = true;
        return okText("");
      },
    });
    const c = createDriveConnector(baseDeps(fetch));
    await collect(c.sync(syncCtx()));
    expect(exportCalled).toBe(false);
  });

  it("body_byte_limit truncates exported text", async () => {
    const { fetch } = mockDriveFetch({
      filesList: () => okBody({ files: [{ id: "doc1", name: "Big doc", mimeType: "application/vnd.google-apps.document" }] }),
      fileExport: () => okText("A".repeat(5000)),
    });
    const c = createDriveConnector(baseDeps(fetch));
    const events = await collect(c.sync(syncCtx({ config: { body_byte_limit: 100 } })));
    const doc = proposalsOf(events).find((p) => p.source_ref === "drive:file:doc1")!;
    // body has trailing permalink line; the A-run inside should be exactly 100 chars.
    const aRunMatch = doc.body.match(/A+/)!;
    expect(aRunMatch[0].length).toBe(100);
  });

  it("checkpoint includes nextPageToken when Drive has more pages", async () => {
    let page = 0;
    const { fetch } = mockDriveFetch({
      filesList: () => {
        page++;
        if (page === 1) return okBody({ files: [{ id: "doc1", name: "Doc", mimeType: "application/vnd.google-apps.document" }], nextPageToken: "p2" });
        return okBody({ files: [{ id: "doc2", name: "Doc2", mimeType: "application/vnd.google-apps.document" }] });
      },
      fileExport: () => okText(""),
    });
    const c = createDriveConnector(baseDeps(fetch));
    const events = await collect(c.sync(syncCtx()));
    const checkpoints = events.filter((e): e is Extract<SyncEvent, { kind: "checkpoint" }> => e.kind === "checkpoint").map((e) => e.cursor);
    expect(checkpoints.some((c) => typeof c === "string" && c.includes("p2"))).toBe(true);
    // Final checkpoint should be "done" once both pages drain.
    expect(checkpoints[checkpoints.length - 1]).toContain('"phase":"done"');
  });

  it("file_limit cuts off mid-sweep and stays in files phase", async () => {
    const { fetch } = mockDriveFetch({
      filesList: () =>
        okBody({
          files: Array.from({ length: 5 }, (_, i) => ({ id: `f${i}`, name: `F${i}`, mimeType: "application/pdf" })),
          nextPageToken: "next",
        }),
    });
    const c = createDriveConnector(baseDeps(fetch));
    const events = await collect(c.sync(syncCtx({ config: { file_limit: 5 } })));
    const checkpoints = events.filter((e): e is Extract<SyncEvent, { kind: "checkpoint" }> => e.kind === "checkpoint").map((e) => e.cursor);
    const final = checkpoints[checkpoints.length - 1] as string;
    expect(final).toContain('"phase":"files"');
    expect(final).toContain("next");
    expect(checkpoints.some((c) => typeof c === "string" && c.includes('"phase":"done"'))).toBe(false);
  });

  it("resuming from { phase: 'files', pageToken } sends pageToken on the first list call", async () => {
    let observed: string | null = null;
    const { fetch } = mockDriveFetch({
      filesList: (url) => {
        observed = url.searchParams.get("pageToken");
        return okBody({ files: [] });
      },
    });
    const c = createDriveConnector(baseDeps(fetch));
    await collect(c.sync(syncCtx({ cursor: JSON.stringify({ phase: "files", pageToken: "resume_me" }) })));
    expect(observed).toBe("resume_me");
  });

  it("maps 401 to AuthExpiredError", async () => {
    const { fetch } = mockDriveFetch({ filesList: () => ({ ok: false, status: 401, body: "no auth" }) });
    const c = createDriveConnector(baseDeps(fetch));
    await expect(collect(c.sync(syncCtx()))).rejects.toMatchObject({ name: "AuthExpiredError" });
  });

  it("maps 429 to RateLimitError", async () => {
    const { fetch } = mockDriveFetch({ filesList: () => ({ ok: false, status: 429, body: "slow down", headers: { "retry-after": "3" } }) });
    const c = createDriveConnector(baseDeps(fetch));
    const err = await collect(c.sync(syncCtx())).catch((e) => e);
    expect(err.name).toBe("RateLimitError");
    expect((err as { retry_after_ms?: number }).retry_after_ms).toBe(3_000);
  });

  it("soft-fails on per-file export error (still emits the proposal as metadata-only)", async () => {
    const { fetch } = mockDriveFetch({
      filesList: () => okBody({ files: [{ id: "doc1", name: "X", mimeType: "application/vnd.google-apps.document" }] }),
      fileExport: () => ({ ok: false, status: 500, body: "boom" }),
    });
    const c = createDriveConnector(baseDeps(fetch));
    const events = await collect(c.sync(syncCtx()));
    const props = proposalsOf(events);
    expect(props.length).toBe(1);
    expect(props[0].type).toBe("note");
    expect(props[0].source_ref).toBe("drive:file:doc1");
  });
});
