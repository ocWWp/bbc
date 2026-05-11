import crypto from "node:crypto";
import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import { registerAdapter, type SourceAdapter } from "../adapter";

const MAX_BYTES = 1_048_576; // 1 MB cap on fetched body
const TIMEOUT_MS = 10_000;
const MIN_TEXT_CHARS = 80;

// Hostname-based block for the obvious private ranges. Note this is not a full
// SSRF defence -- DNS rebinding still wins against this. ADR-0005 accepts that
// risk for v1; per-tenant rate limits are the planned mitigation. Do not loosen
// without revisiting that ADR.
const PRIVATE_HOST =
  /^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|169\.254\.|127\.|0\.0\.0\.0$|localhost$)/i;

export const urlAdapter: SourceAdapter<{ url: string }> = {
  kind: "url",
  async ingest({ url }) {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return { ok: false, error: "Invalid URL." };
    }
    if (!/^https?:$/.test(parsed.protocol)) {
      return { ok: false, error: "Only http(s) URLs are supported." };
    }
    if (PRIVATE_HOST.test(parsed.hostname)) {
      return { ok: false, error: "Private/loopback addresses are blocked." };
    }

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    let html: string;
    try {
      const res = await fetch(parsed.toString(), {
        signal: ctrl.signal,
        redirect: "follow",
        headers: { "user-agent": "BBC-Ingestion/1.0 (+https://bigbrain.company)" },
      });
      if (!res.ok) {
        return { ok: false, error: `Fetch returned ${res.status}.` };
      }
      const declaredLen = Number(res.headers.get("content-length") ?? 0);
      if (declaredLen > MAX_BYTES) {
        return { ok: false, error: "Response too large (>1 MB)." };
      }
      const ct = res.headers.get("content-type") ?? "";
      if (!ct.startsWith("text/html") && !ct.startsWith("text/plain") && !ct.startsWith("application/xhtml")) {
        return { ok: false, error: `Unsupported content-type: ${ct || "(missing)"}.` };
      }
      const buf = await res.arrayBuffer();
      if (buf.byteLength > MAX_BYTES) {
        return { ok: false, error: "Response too large (>1 MB)." };
      }
      html = new TextDecoder().decode(buf);
    } catch (e) {
      const message =
        e instanceof Error && e.name === "AbortError"
          ? "Fetch timed out (10s)."
          : e instanceof Error
            ? `Fetch failed: ${e.message}`
            : "Fetch failed.";
      return { ok: false, error: message };
    } finally {
      clearTimeout(timer);
    }

    // linkedom returns a Document-like object; Readability accepts it duck-typed.
    const { document } = parseHTML(html);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const article = new Readability(document as any).parse();
    const text = (article?.textContent ?? document.body?.textContent ?? "").trim().replace(/\s+\n/g, "\n");
    if (text.length < MIN_TEXT_CHARS) {
      return { ok: false, error: "Page content too short after parsing." };
    }
    if (text.length > 50_000) {
      // Truncate rather than reject -- a 200KB blog post is still useful, just slice it.
      const truncated = text.slice(0, 50_000);
      return {
        ok: true,
        rawText: truncated,
        locator: {
          kind: "url",
          href: parsed.toString(),
          title: article?.title ?? "",
          truncated: true,
          original_length: text.length,
        },
        contentHash: crypto.createHash("sha256").update(truncated).digest("hex"),
        byteSize: Buffer.byteLength(truncated, "utf8"),
      };
    }

    return {
      ok: true,
      rawText: text,
      locator: {
        kind: "url",
        href: parsed.toString(),
        title: article?.title ?? "",
      },
      contentHash: crypto.createHash("sha256").update(text).digest("hex"),
      byteSize: Buffer.byteLength(text, "utf8"),
    };
  },
};

registerAdapter(urlAdapter);
