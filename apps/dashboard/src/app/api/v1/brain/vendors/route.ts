import { NextResponse } from "next/server";
import { adminClient, allowedTypesForRole } from "@/lib/api-auth";
import { authedRoute } from "@/lib/api-rest-helpers";
import { listVendors } from "@/lib/brain-api";

// GET /api/v1/brain/vendors
export const GET = authedRoute("read", async (_req, resolved) => {
  const allowedTypes = allowedTypesForRole(resolved.role);
  const rows = await listVendors(adminClient(), resolved.tenant_id, { allowedTypes });
  return NextResponse.json({ vendors: rows });
});
