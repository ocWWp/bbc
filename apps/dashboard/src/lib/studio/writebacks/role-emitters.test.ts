import { describe, expect, it } from "vitest";
import "./index"; // side-effect: register all emitters
import { getWritebackEmitter } from "./registry";
import type { WritebackContext } from "./types";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { OutputBlock } from "@/lib/studio/output-blocks";

type AnyFn = (..._args: unknown[]) => unknown;

function makeStub(inserts: { table: string; row: Record<string, unknown> }[]): SupabaseClient<Database> {
  const from = ((table: string) => {
    if (table === "memory_files") {
      return {
        insert: (row: Record<string, unknown>) => {
          inserts.push({ table, row });
          return {
            select: () => ({
              single: async () => ({ data: { id: "audit-uuid" }, error: null }),
            }),
          };
        },
      };
    }
    if (table === "queue_items") {
      return {
        insert: async (row: Record<string, unknown>) => {
          inserts.push({ table, row });
          return { error: null };
        },
      };
    }
    throw new Error(`unexpected table: ${table}`);
  }) as AnyFn;
  return { from } as unknown as SupabaseClient<Database>;
}

function ctx(
  templateId: string,
  inputs: Record<string, string>,
  blocks: OutputBlock[] = [{ kind: "plain", props: { text: "drafted output" } }],
): WritebackContext {
  return {
    runId: "11111111-2222-3333-4444-555555555555",
    templateId,
    task: "task framing",
    inputs,
    outputBlocks: blocks,
    citedMemoryIds: [],
    tenantId: "tenant-abc",
    userId: "user-abc",
    userActor: "human:google:test@example.com",
  };
}

describe("founder writeback emitters", () => {
  const auditOnly: Array<{ id: string; inputs: Record<string, string> }> = [
    {
      id: "founder:board-update",
      inputs: { period: "Q4 2026", key_metric: "$42k MRR" },
    },
    {
      id: "founder:weekly-recap",
      inputs: { highlights: "Shipped X, hired Y", blockers: "Pricing stuck" },
    },
  ];
  for (const c of auditOnly) {
    it(`${c.id} registers and emits an audit row only`, async () => {
      const e = getWritebackEmitter(c.id);
      expect(e).toBeDefined();
      const inserts: { table: string; row: Record<string, unknown> }[] = [];
      const res = await e!.emit(ctx(c.id, c.inputs), makeStub(inserts));
      expect(res.artifacts).toHaveLength(1);
      expect(res.proposals).toHaveLength(0);
      const audit = inserts.find((i) => i.table === "memory_files");
      expect(audit?.row.type).toBe("source_artifact");
    });
  }

  it("founder:strategic-memo emits an audit row AND files an ADR proposal", async () => {
    const e = getWritebackEmitter("founder:strategic-memo")!;
    const inserts: { table: string; row: Record<string, unknown> }[] = [];
    const memo = [
      "# Should we charge for the cloud demo",
      "",
      "**Short answer:** No, keep it free.",
      "",
      "## Recommendation",
      "Treat the demo as marketing spend.",
    ].join("\n");
    const res = await e.emit(
      ctx(
        "founder:strategic-memo",
        { question: "Should we charge for the cloud demo?", audience: "leadership" },
        [{ kind: "plain", props: { text: memo } }],
      ),
      makeStub(inserts),
    );
    expect(res.artifacts).toHaveLength(1);
    expect(res.proposals).toHaveLength(1);
    const proposal = res.proposals[0]!;
    expect(proposal.target_file.startsWith("memory/decisions/")).toBe(true);
    const queueRow = inserts.find((i) => i.table === "queue_items")?.row as
      | { frontmatter?: { memory_type?: string; target_layer?: string } }
      | undefined;
    expect(queueRow?.frontmatter?.memory_type).toBe("decision");
    expect(queueRow?.frontmatter?.target_layer).toBe("main");
  });
});

describe("designer writeback emitters", () => {
  const auditOnly: Array<{ id: string; inputs: Record<string, string> }> = [
    {
      id: "design:visual-spec",
      inputs: { feature: "Empty state on /memory", goal: "Onboard a new tenant" },
    },
    {
      id: "design:ui-copy-pass",
      inputs: { strings: "Sign up\nLogin\nCreate account", surface: "auth header" },
    },
  ];
  for (const c of auditOnly) {
    it(`${c.id} registers and emits an audit row only`, async () => {
      const e = getWritebackEmitter(c.id);
      expect(e).toBeDefined();
      const inserts: { table: string; row: Record<string, unknown> }[] = [];
      const res = await e!.emit(ctx(c.id, c.inputs), makeStub(inserts));
      expect(res.artifacts).toHaveLength(1);
      expect(res.proposals).toHaveLength(0);
    });
  }

  it("design:brand-guideline-entry emits an audit row AND files a brand-guideline proposal", async () => {
    const e = getWritebackEmitter("design:brand-guideline-entry")!;
    const inserts: { table: string; row: Record<string, unknown> }[] = [];
    const entry = [
      "# Color usage",
      "",
      "## What we believe",
      "Color carries meaning; never decoration.",
    ].join("\n");
    const res = await e.emit(
      ctx(
        "design:brand-guideline-entry",
        { topic: "color usage", context: "new contractor onboarding" },
        [{ kind: "plain", props: { text: entry } }],
      ),
      makeStub(inserts),
    );
    expect(res.artifacts).toHaveLength(1);
    expect(res.proposals).toHaveLength(1);
    const proposal = res.proposals[0]!;
    expect(proposal.target_file).toBe("memory/design/guidelines/color-usage.md");
    const queueRow = inserts.find((i) => i.table === "queue_items")?.row as
      | { frontmatter?: { memory_type?: string; target_layer?: string } }
      | undefined;
    expect(queueRow?.frontmatter?.memory_type).toBe("decision");
    expect(queueRow?.frontmatter?.target_layer).toBe("manager");
  });
});

describe("marketing writeback emitters", () => {
  const marketingIds = [
    "marketing:blog-post-draft",
    "marketing:cross-platform-campaign",
    "marketing:custom",
    "marketing:hashtag-strategy",
    "marketing:linkedin-announcement",
    "marketing:reel-script",
    "marketing:single-x-post",
    "marketing:threads-post",
    "marketing:tweet-thread",
    "marketing:voice-consistency-check",
  ];

  for (const id of marketingIds) {
    it(`${id} registers and emits an audit row`, async () => {
      const e = getWritebackEmitter(id);
      expect(e).toBeDefined();
      const inserts: { table: string; row: Record<string, unknown> }[] = [];
      const res = await e!.emit(ctx(id, { foo: "bar" }), makeStub(inserts));
      expect(res.artifacts).toHaveLength(1);
      expect(res.proposals).toHaveLength(0);
      const audit = inserts.find((i) => i.table === "memory_files");
      expect(audit?.row.type).toBe("source_artifact");
    });
  }

  it("tweet-thread output is rendered as a numbered list in audit content", async () => {
    const e = getWritebackEmitter("marketing:tweet-thread")!;
    const inserts: { table: string; row: Record<string, unknown> }[] = [];
    await e.emit(
      ctx("marketing:tweet-thread", { tone: "punchy" }, [
        {
          kind: "x_thread",
          props: {
            posts: [{ text: "First tweet hook." }, { text: "Second tweet payoff." }],
          },
        },
      ]),
      makeStub(inserts),
    );
    const audit = inserts.find((i) => i.table === "memory_files")!;
    const content = (audit.row as { content: string }).content;
    expect(content).toContain("1. First tweet hook.");
    expect(content).toContain("2. Second tweet payoff.");
  });

  it("blog-post-draft output is rendered with title and body in audit content", async () => {
    const e = getWritebackEmitter("marketing:blog-post-draft")!;
    const inserts: { table: string; row: Record<string, unknown> }[] = [];
    await e.emit(
      ctx("marketing:blog-post-draft", { target_words: "800-1200" }, [
        {
          kind: "blog_draft",
          props: {
            title: "Why we chose AGPL",
            subtitle: "And what it means for you",
            body_markdown: "It started with a simple observation...",
          },
        },
      ]),
      makeStub(inserts),
    );
    const audit = inserts.find((i) => i.table === "memory_files")!;
    const content = (audit.row as { content: string }).content;
    expect(content).toContain("Why we chose AGPL");
    expect(content).toContain("It started with a simple observation");
  });
});
