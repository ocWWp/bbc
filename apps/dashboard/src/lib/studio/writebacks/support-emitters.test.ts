import { describe, expect, it } from "vitest";
import "./index"; // side-effect: register all emitters
import { getWritebackEmitter } from "./registry";
import type { WritebackContext } from "./types";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { OutputBlock } from "@/lib/studio/output-blocks";

type AnyFn = (..._args: unknown[]) => unknown;

// Minimal stub. Returns a deterministic memory_files insert id; collects
// inserts so each test can assert table + row shape.
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

function ctx(templateId: string, inputs: Record<string, string>, replyText = "drafted reply"): WritebackContext {
  return {
    runId: "11111111-2222-3333-4444-555555555555",
    templateId,
    task: "task framing",
    inputs,
    outputBlocks: [{ kind: "plain", props: { text: replyText } } as OutputBlock],
    citedMemoryIds: [],
    tenantId: "tenant-abc",
    userId: "user-abc",
    userActor: "human:google:test@example.com",
  };
}

describe("support writeback emitters — register + emit audit row", () => {
  const cases: Array<{
    id: string;
    inputs: Record<string, string>;
    extraProposals?: number;
  }> = [
    {
      id: "support:customer-reply",
      inputs: {
        ticket_text: "Where do I find my API key?",
        customer_name: "Jordan",
        severity: "low",
      },
    },
    {
      id: "support:churn-save",
      inputs: {
        cancellation_message: "Too expensive for what we use.",
        customer_name: "Sam",
        plan: "Pro",
        tenure: "6 months",
      },
    },
    {
      id: "support:bug-ack",
      inputs: {
        ticket_text: "Exports are returning empty CSVs.",
        customer_name: "Mei",
        can_reproduce: "yes",
        severity: "high",
      },
    },
    {
      id: "support:incident-status",
      inputs: {
        component: "public API",
        symptom: "5xx errors",
        current_status: "investigating",
        update_cadence: "30 min",
      },
    },
  ];

  for (const c of cases) {
    it(`${c.id} registers and emits an audit source_artifact row`, async () => {
      const e = getWritebackEmitter(c.id);
      expect(e).toBeDefined();
      const inserts: { table: string; row: Record<string, unknown> }[] = [];
      const stub = makeStub(inserts);
      const res = await e!.emit(ctx(c.id, c.inputs), stub);
      expect(res.artifacts).toHaveLength(1);
      expect(res.artifacts[0]!.type).toBe("source_artifact");
      const audit = inserts.find((i) => i.table === "memory_files");
      expect(audit?.row.type).toBe("source_artifact");
    });
  }

  it("incident-status resolved status ALSO files a known-incidents proposal", async () => {
    const inserts: { table: string; row: Record<string, unknown> }[] = [];
    const stub = makeStub(inserts);
    const e = getWritebackEmitter("support:incident-status")!;
    const res = await e.emit(
      ctx("support:incident-status", {
        component: "public API",
        symptom: "5xx errors",
        current_status: "resolved",
        cause_summary: "stale Cloudflare KV namespace binding",
      }),
      stub,
    );
    expect(res.artifacts).toHaveLength(1);
    expect(res.proposals).toHaveLength(1);
    expect(res.proposals[0]!.target_file).toBe("memory/support/known-incidents.md");
    const queueInsert = inserts.find((i) => i.table === "queue_items");
    expect(queueInsert).toBeDefined();
  });

  it("incident-status non-resolved status does NOT file a proposal", async () => {
    const inserts: { table: string; row: Record<string, unknown> }[] = [];
    const stub = makeStub(inserts);
    const e = getWritebackEmitter("support:incident-status")!;
    const res = await e.emit(
      ctx("support:incident-status", {
        component: "public API",
        symptom: "5xx",
        current_status: "monitoring",
      }),
      stub,
    );
    expect(res.proposals).toHaveLength(0);
  });
});
