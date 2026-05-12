import { NextResponse } from "next/server";
import { adminClient } from "@/lib/api-auth";
import { authedRoute } from "@/lib/api-rest-helpers";
import { listVendors } from "@/lib/brain-api";

// GET /api/v1/brain/vendors
export const GET = authedRoute("read", async (_req, resolved) => {
  const rows = await listVendors(adminClient(), resolved.tenant_id);
  return NextResponse.json({ vendors: rows });
});
