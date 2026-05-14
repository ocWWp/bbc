import { NextResponse } from "next/server";
import { adminClient, allowedTypesForRole } from "@/lib/api-auth";
import { authedRoute, parseLimit } from "@/lib/api-rest-helpers";
import { searchMemories } from "@/lib/brain-api";

// GET /api/v1/brain/search?q=auth&limit=10
export const GET = authedRoute("read", async (req, resolved) => {
  const q = req.nextUrl.searchParams.get("q") ?? "";
  const limit = parseLimit(req);
  if (q.trim().length < 2) {
    return NextResponse.json(
      { error: "bad_request", message: "Query parameter `q` must be at least 2 characters." },
      { status: 400 },
    );
  }
  const allowedTypes = allowedTypesForRole(resolved.role);
  const rows = await searchMemories(adminClient(), resolved.tenant_id, {
    query: q,
    limit,
    allowedTypes,
  });
  return NextResponse.json({ memories: rows });
});
