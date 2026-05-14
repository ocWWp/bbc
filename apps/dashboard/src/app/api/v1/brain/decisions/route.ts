import { NextResponse } from "next/server";
import { adminClient, allowedTypesForRole } from "@/lib/api-auth";
import { authedRoute, parseLimit } from "@/lib/api-rest-helpers";
import { listDecisions } from "@/lib/brain-api";

// GET /api/v1/brain/decisions?limit=10
export const GET = authedRoute("read", async (req, resolved) => {
  const limit = parseLimit(req);
  const allowedTypes = allowedTypesForRole(resolved.role);
  const rows = await listDecisions(adminClient(), resolved.tenant_id, { limit, allowedTypes });
  return NextResponse.json({ decisions: rows });
});
