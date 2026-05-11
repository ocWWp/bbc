import crypto from "node:crypto";
import { registerAdapter, type SourceAdapter } from "../adapter";

// Mirrors MIN_INPUT_CHARS in apps/dashboard/src/app/welcome/actions.ts.
// Max here is generous (URL/file content can be longer than a typed paste);
// the extractor itself slices to its own MAX_INPUT_CHARS budget downstream.
const MIN_CHARS = 80;
const MAX_CHARS = 50_000;

export const textAdapter: SourceAdapter<{ text: string }> = {
  kind: "text",
  async ingest({ text }) {
    const trimmed = (text ?? "").trim();
    if (trimmed.length < MIN_CHARS) {
      return { ok: false, error: `Too short (min ${MIN_CHARS} chars).` };
    }
    if (trimmed.length > MAX_CHARS) {
      return { ok: false, error: `Too long (max ${MAX_CHARS.toLocaleString()} chars).` };
    }
    const contentHash = crypto.createHash("sha256").update(trimmed).digest("hex");
    return {
      ok: true,
      rawText: trimmed,
      locator: { kind: "text", length: trimmed.length },
      contentHash,
      byteSize: Buffer.byteLength(trimmed, "utf8"),
    };
  },
};

registerAdapter(textAdapter);
