import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { resolveBearer, scopeAllows, type ResolvedKey } from "@/lib/api-auth";

/**
 * Convenience wrapper for REST routes under /api/v1/brain/*. Resolves the
 * Bearer token, enforces scope, and turns thrown errors into 5xx JSON.
 */

type Handler = (req: NextRequest, resolved: ResolvedKey) => Promise<Response>;

export function authedRoute(
  needScope: ResolvedKey["scope"],
  handler: Handler,
): (req: NextRequest) => Promise<Response> {
  return async (req: NextRequest) => {
    const resolved = await resolveBearer(req.headers.get("authorization"));
    if (!resolved) {
      return NextResponse.json(
        { error: "unauthorized", message: "Invalid or missing API key." },
        { status: 401 },
      );
    }
    if (!scopeAllows(resolved.scope, needScope)) {
      return NextResponse.json(
        {
          error: "forbidden",
          message: `This endpoint requires '${needScope}' scope; key has '${resolved.scope}'.`,
        },
        { status: 403 },
      );
    }
    try {
      return await handler(req, resolved);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "unknown";
      return NextResponse.json({ error: "server_error", message: msg }, { status: 500 });
    }
  };
}

export function parseLimit(req: NextRequest): number | undefined {
  const raw = req.nextUrl.searchParams.get("limit");
  if (raw === null) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : undefined;
}
