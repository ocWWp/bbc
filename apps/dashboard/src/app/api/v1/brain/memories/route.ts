import { NextResponse, type NextRequest } from "next/server";
import { adminClient } from "@/lib/api-auth";
import { authedRoute, parseLimit } from "@/lib/api-rest-helpers";
import { listMemories, submitMemory } from "@/lib/brain-api";

// GET /api/v1/brain/memories?type=decision&limit=10
export const GET = authedRoute("read", async (req, resolved) => {
  const type = req.nextUrl.searchParams.get("type") ?? undefined;
  const limit = parseLimit(req);
  const rows = await listMemories(adminClient(), resolved.tenant_id, { type, limit });
  return NextResponse.json({ memories: rows });
});

// POST /api/v1/brain/memories  body: { type, title, content?, fields? }
export const POST = authedRoute("write", async (req, resolved) => {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request", message: "Invalid JSON." }, { status: 400 });
  }
  const b = (body ?? {}) as {
    type?: unknown;
    title?: unknown;
    content?: unknown;
    fields?: unknown;
  };
  const type = typeof b.type === "string" ? b.type : "";
  const title = typeof b.title === "string" ? b.title : "";
  const content = typeof b.content === "string" ? b.content : undefined;
  const fields =
    b.fields && typeof b.fields === "object" && !Array.isArray(b.fields)
      ? (b.fields as Record<string, unknown>)
      : undefined;

  const res = await submitMemory(adminClient(), resolved.tenant_id, {
    type,
    title,
    content,
    fields,
  });
  if (!res.ok) {
    return NextResponse.json({ error: "bad_request", message: res.error }, { status: 400 });
  }
  return NextResponse.json({ id: res.id, status: "active" }, { status: 201 });
});
