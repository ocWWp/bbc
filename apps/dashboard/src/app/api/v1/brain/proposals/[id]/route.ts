import { NextResponse, type NextRequest } from "next/server";
import { adminClient, resolveBearer } from "@/lib/api-auth";
import { getProposal } from "@/lib/brain-api";

// GET /api/v1/brain/proposals/[id]
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
  if (!id || id.length > 200) {
    return NextResponse.json(
      { error: "bad_request", message: "Invalid proposal id." },
      { status: 400 },
    );
  }

  try {
    const row = await getProposal(adminClient(), resolved.tenant_id, id);
    if (!row) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    return NextResponse.json(row);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    return NextResponse.json({ error: "server_error", message: msg }, { status: 500 });
  }
}
