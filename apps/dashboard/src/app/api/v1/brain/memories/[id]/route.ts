import { NextResponse, type NextRequest } from "next/server";
import { adminClient, allowedTypesForRole, resolveBearer } from "@/lib/api-auth";
import { getMemory } from "@/lib/brain-api";

// GET /api/v1/brain/memories/[id]
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const resolved = await resolveBearer(req.headers.get("authorization"));
  if (!resolved) {
    return NextResponse.json(
      { error: "unauthorized", message: "Invalid or missing API key." },
      { status: 401 },
    );
  }

  const { id } = await params;
  if (!/^[0-9a-fA-F-]{36}$/.test(id)) {
    return NextResponse.json(
      { error: "bad_request", message: "Memory id must be a uuid." },
      { status: 400 },
    );
  }

  try {
    const allowedTypes = allowedTypesForRole(resolved.role);
    const row = await getMemory(adminClient(), resolved.tenant_id, id, { allowedTypes });
    if (!row) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    return NextResponse.json(row);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    return NextResponse.json({ error: "server_error", message: msg }, { status: 500 });
  }
}
