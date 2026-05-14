// One-line studio cost / cache usage logger.
//
// Logs to console.info so it shows up in Cloudflare Workers logs alongside
// the existing studio.run* lines. Surface fields:
//   - input_tokens (full-price prompt tokens)
//   - output_tokens
//   - cache_creation_input_tokens (first-time cache write — billed at 125%)
//   - cache_read_input_tokens (cache hit — billed at 10%)
//
// Cache wins are visible when cache_read_input_tokens > 0 on the 2nd+ call.

import type Anthropic from "@anthropic-ai/sdk";

export function logStudioUsage(
  label: string,
  resp: Anthropic.Messages.Message,
  ctx: { tenantId: string; templateId?: string; model?: string },
): void {
  const u = resp.usage;
  console.info(
    `studio.usage: ${label} tenant=${ctx.tenantId}` +
      (ctx.templateId ? ` template=${ctx.templateId}` : "") +
      (ctx.model ? ` model=${ctx.model}` : "") +
      ` in=${u.input_tokens} out=${u.output_tokens}` +
      ` cache_create=${u.cache_creation_input_tokens ?? 0}` +
      ` cache_read=${u.cache_read_input_tokens ?? 0}`,
  );
}
