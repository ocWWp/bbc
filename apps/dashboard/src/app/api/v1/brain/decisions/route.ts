import { NextResponse } from "next/server";
import { adminClient } from "@/lib/api-auth";
import { authedRoute, parseLimit } from "@/lib/api-rest-helpers";
import { listDecisions } from "@/lib/brain-api";

// GET /api/v1/brain/decisions?limit=10
export const GET = authedRoute("read", async (req, resolved) => {
  const limit = parseLimit(req);
  const rows = await listDecisions(adminClient(), resolved.tenant_id, { limit });
  return NextResponse.json({ decisions: rows });
});
