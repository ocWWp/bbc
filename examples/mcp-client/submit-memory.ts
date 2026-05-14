/**
 * Submit a new memory via the REST shim.
 *
 * Usage:
 *   export BBC_URL="http://localhost:3000"
 *   export BBC_API_KEY="bbc_xxx.yyy"   # MUST be write-scope
 *   npx tsx submit-memory.ts
 *
 * The example submits a `decision` memory. Adapt the type + fields to any of
 * the nine supertags (see docs/concepts/memory-types.mdx).
 */

const BBC_URL = requireEnv("BBC_URL");
const BBC_API_KEY = requireEnv("BBC_API_KEY");

async function main() {
  const payload = {
    type: "decision",
    title: "Use BBC's brain for AI context across all tools",
    content:
      "We were re-pasting context into ChatGPT, Cursor, and Notion AI every week. Centralizing typed memory in BBC and pointing every tool at the MCP server eliminates the re-paste loop.",
    fields: {
      decision: "BBC is the single source of truth for company context.",
      rationale: "Each AI tool currently has its own version of the company. One brain to rule them all.",
      consequences: [
        "Every AI tool now has to be configured to call BBC's MCP server",
        "BBC must stay running -- it's a load-bearing dependency",
        "Self-host removes the obvious SPOF concern: it's our box",
      ],
    },
  };

  const res = await fetch(`${BBC_URL}/api/v1/brain/memories`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${BBC_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const body = await res.json();
  if (!res.ok) {
    console.error("HTTP error:", res.status, body);
    process.exit(1);
  }

  console.log(`Submitted ${payload.type} memory:`);
  console.log(`  id:     ${body.id}`);
  console.log(`  status: ${body.status}`);
  console.log(`  view:   ${BBC_URL}/memory/${body.id}`);
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing env var ${name}`);
    process.exit(1);
  }
  return v;
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
