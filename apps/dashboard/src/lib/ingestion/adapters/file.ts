import crypto from "node:crypto";
import { registerAdapter, type SourceAdapter } from "../adapter";

const MAX_BYTES = 1_048_576; // 1 MB
const ALLOWED_EXT = /\.(md|markdown|txt)$/i;
const MIN_TEXT_CHARS = 80;

export const fileAdapter: SourceAdapter<{ name: string; bytes: Uint8Array }> = {
  kind: "file",
  async ingest({ name, bytes }) {
    if (!ALLOWED_EXT.test(name)) {
      return { ok: false, error: "Only .md, .markdown, .txt files are supported." };
    }
    if (bytes.byteLength > MAX_BYTES) {
      return { ok: false, error: "File too large (>1 MB)." };
    }
    const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes).trim();
    if (text.length < MIN_TEXT_CHARS) {
      return { ok: false, error: "File content too short." };
    }
    const truncated = text.length > 50_000 ? text.slice(0, 50_000) : text;
    return {
      ok: true,
      rawText: truncated,
      locator: {
        kind: "file",
        filename: name,
        ...(truncated.length < text.length ? { truncated: true, original_length: text.length } : {}),
      },
      contentHash: crypto.createHash("sha256").update(bytes).digest("hex"),
      byteSize: bytes.byteLength,
    };
  },
};

registerAdapter(fileAdapter);
