import { NextResponse } from "next/server";

// GET /api/v1/brain — discovery endpoint. Lists the REST shim's surface so
// curl-only users can see what's available without reading the docs.
export function GET() {
  return NextResponse.json({
    name: "bbc-brain-rest",
    version: "v1",
    auth: "Authorization: Bearer bbc_<key_id>.<secret> (from /api-keys)",
    endpoints: [
      { method: "GET", path: "/api/v1/brain/memories", query: "type, limit", scope: "read" },
      { method: "GET", path: "/api/v1/brain/memories/[id]", scope: "read" },
      { method: "POST", path: "/api/v1/brain/memories", body: "{ type, title, content?, fields? }", scope: "write" },
      { method: "GET", path: "/api/v1/brain/search", query: "q, limit", scope: "read" },
      { method: "GET", path: "/api/v1/brain/decisions", query: "limit", scope: "read" },
      { method: "GET", path: "/api/v1/brain/vendors", scope: "read" },
      { method: "GET", path: "/api/v1/brain/proposals", query: "status, limit", scope: "read" },
      { method: "GET", path: "/api/v1/brain/proposals/[id]", scope: "read" },
    ],
  });
}
