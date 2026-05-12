import { NextResponse } from "next/server";
import { adminClient } from "@/lib/api-auth";
import { authedRoute, parseLimit } from "@/lib/api-rest-helpers";
import { listProposals } from "@/lib/brain-api";

// GET /api/v1/brain/proposals?status=pending&limit=10
export const GET = authedRoute("read", async (req, resolved) => {
  const rawStatus = req.nextUrl.searchParams.get("status");
  const status =
    rawStatus === "pending" || rawStatus === "accepted" || rawStatus === "rejected"
      ? rawStatus
      : undefined;
  const limit = parseLimit(req);
  const rows = await listProposals(adminClient(), resolved.tenant_id, { status, limit });
  return NextResponse.json({ proposals: rows });
});
