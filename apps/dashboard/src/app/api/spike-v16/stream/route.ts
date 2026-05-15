// M1.2 SSE spike: proves text/event-stream works through `pnpm dev` AND
// the OpenNext Cloudflare Worker bundle (`pnpm cf:preview` and a deployed
// preview env). Outcome is the M1 hard gate per
// docs/plans/2026-05-15-agentic-home-PLAN.md §M1.2: if SSE buffers or
// breaks on the deployed Worker, the v1.6 wire protocol falls back to
// long-polling before M2 starts.
//
// Delete this route after M2 ships and the production /api/home/turn
// endpoint replaces it as the canonical streaming surface.

import type { NextRequest } from "next/server";

export async function GET(_req: NextRequest) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      for (let i = 0; i < 5; i++) {
        controller.enqueue(
          encoder.encode(`event: tick\ndata: {"i":${i}}\n\n`),
        );
        await new Promise((r) => setTimeout(r, 200));
      }
      controller.enqueue(encoder.encode(`event: done\ndata: {}\n\n`));
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
      // Disable Next.js Route Handler output caching — SSE is dynamic by
      // definition.
      "CDN-Cache-Control": "no-store",
    },
  });
}

// Force-dynamic so the response is not statically cached by Next.js.
export const dynamic = "force-dynamic";
