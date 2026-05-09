import type { AuthContext } from "../auth";
import { tenantScopedClient } from "../auth";

export const readMemoryTool = {
  name: "read_memory",
  description:
    "Read a memory file by path within the current tenant. Returns the file's frontmatter + content. Tenant context is resolved from the API key.",
  inputSchema: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "Relative path under memory/ (e.g. 'decisions/0001-bbc-v1-scope.md')",
      },
    },
    required: ["path"],
  },
} as const;

export async function callReadMemory(ctx: AuthContext, args: { path: string }) {
  const sb = tenantScopedClient(ctx.tenant_id);
  const { data, error } = await sb
    .from("memory_files")
    .select("path,content,frontmatter,updated_at")
    .eq("tenant_id", ctx.tenant_id)
    .eq("path", args.path)
    .maybeSingle();
  if (error) {
    return { content: [{ type: "text" as const, text: `Error: ${error.message}` }] };
  }
  if (!data) {
    return { content: [{ type: "text" as const, text: `No memory file at path: ${args.path}` }] };
  }
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(
          { path: data.path, frontmatter: data.frontmatter, content: data.content, updated_at: data.updated_at },
          null,
          2,
        ),
      },
    ],
  };
}
