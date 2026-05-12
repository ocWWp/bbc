import { describe, expect, it, vi, beforeEach } from "vitest";
import "./feature-request-triage"; // side-effect: register emitter
import { getWritebackEmitter } from "./registry";
import type { WritebackContext } from "./types";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { OutputBlock } from "@/lib/studio/output-blocks";

// Stub Supabase. The writeback emitter calls .from().insert().select().single()
// for memory_files and .from().insert() for queue_items, plus .from().select()...
// chains for the decision-overlap and primary-product probes. Each method
// returns `this` until terminal methods (.single, .maybeSingle, .insert with
// .select chain) resolve to { data, error }.

type AnyFn = (..._args: unknown[]) => unknown;

function makeSupabaseStub(opts: {
  decisionRows?: Array<{ title: string; content: string }>;
  productRow?: { id: string; path: string } | null;
  inserts: { table: string; row: Record<string, unknown> }[];
}): SupabaseClient<Database> {
  const insertCalls = opts.inserts;
  const from = vi.fn((table: string) => {
    // memory_files insert path returns { id }, queue_items insert returns void.
    // Both call .insert(row).select("id").single() or .insert(row).
    if (table === "memory_files") {
      return {
        insert: (row: Record<string, unknown>) => {
          insertCalls.push({ table, row });
          // Type discriminates by .type field
          if (row.type === "source_artifact") {
            return {
              select: () => ({
                single: async () => ({ data: { id: "artifact-uuid" }, error: null }),
              }),
            };
          }
          return {
            select: () => ({
              single: async () => ({ data: { id: "mem-uuid" }, error: null }),
            }),
          };
        },
        // Decision-overlap probe: .from().select().eq().eq().eq().limit()
        select: () => {
          const chain = {
            eq: () => chain,
            limit: async () => ({ data: opts.decisionRows ?? [], error: null }),
            order: () => ({
              limit: () => ({
                maybeSingle: async () => ({ data: opts.productRow ?? null, error: null }),
              }),
            }),
          };
          return chain;
        },
      };
    }
    if (table === "queue_items") {
      return {
        insert: async (row: Record<string, unknown>) => {
          insertCalls.push({ table, row });
          return { error: null };
        },
      };
    }
    throw new Error(`unexpected table: ${table}`);
  }) as AnyFn;
  return { from } as unknown as SupabaseClient<Database>;
}

const BASE_CTX: WritebackContext = {
  runId: "11111111-2222-3333-4444-555555555555",
  templateId: "support:feature-request-triage",
  task: "Customer asked for SSO",
  inputs: {
    request_text: "Can you add SSO via Okta?",
    feature_summary: "SSO via Okta",
    verdict: "auto",
  },
  outputBlocks: [
    { kind: "plain", props: { text: "Hey -- SSO via Okta is on our radar..." } } as OutputBlock,
  ],
  citedMemoryIds: [],
  tenantId: "tenant-abc",
  userId: "user-abc",
  userActor: "human:google:test@example.com",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("feature-request-triage writeback", () => {
  it("registers under support:feature-request-triage", () => {
    const e = getWritebackEmitter("support:feature-request-triage");
    expect(e).toBeDefined();
    expect(e?.templateId).toBe("support:feature-request-triage");
  });

  it("auto verdict: files source_artifact + feat-log proposal only", async () => {
    const inserts: { table: string; row: Record<string, unknown> }[] = [];
    const stub = makeSupabaseStub({ inserts });
    const e = getWritebackEmitter("support:feature-request-triage")!;
    const res = await e.emit(BASE_CTX, stub);

    expect(res.artifacts).toHaveLength(1);
    expect(res.artifacts[0]!.type).toBe("source_artifact");
    expect(res.proposals).toHaveLength(1);
    expect(res.proposals[0]!.target_file).toBe("memory/product/feature-request-log.md");

    // Inserts: one memory_files (source_artifact) + one queue_items (feat-log).
    expect(inserts.filter((i) => i.table === "memory_files")).toHaveLength(1);
    expect(inserts.filter((i) => i.table === "queue_items")).toHaveLength(1);
  });

  it("wont-build verdict without covering decision: files ADR proposal too", async () => {
    const inserts: { table: string; row: Record<string, unknown> }[] = [];
    const stub = makeSupabaseStub({ inserts, decisionRows: [] });
    const e = getWritebackEmitter("support:feature-request-triage")!;
    const res = await e.emit({ ...BASE_CTX, inputs: { ...BASE_CTX.inputs, verdict: "wont-build" } }, stub);

    expect(res.proposals).toHaveLength(2);
    const targets = res.proposals.map((p) => p.target_file);
    expect(targets).toContain("memory/product/feature-request-log.md");
    expect(targets.some((t) => t.startsWith("memory/decisions/NNNN-wont-build-"))).toBe(true);
  });

  it("wont-build verdict WITH a covering decision: skips ADR proposal", async () => {
    const inserts: { table: string; row: Record<string, unknown> }[] = [];
    // A decision whose tokens overlap "sso okta" by >=2.
    const stub = makeSupabaseStub({
      inserts,
      decisionRows: [{ title: "No SSO for hobby tier", content: "We don't ship okta sso below team plan." }],
    });
    const e = getWritebackEmitter("support:feature-request-triage")!;
    const res = await e.emit({ ...BASE_CTX, inputs: { ...BASE_CTX.inputs, verdict: "wont-build" } }, stub);

    expect(res.proposals).toHaveLength(1); // feat-log only -- ADR skipped
    expect(res.proposals[0]!.target_file).toBe("memory/product/feature-request-log.md");
  });

  it("already-shipped verdict: files roadmap-status correction when product memory exists", async () => {
    const inserts: { table: string; row: Record<string, unknown> }[] = [];
    const stub = makeSupabaseStub({
      inserts,
      productRow: { id: "prod-uuid", path: "memory/product/positioning.md" },
    });
    const e = getWritebackEmitter("support:feature-request-triage")!;
    const res = await e.emit(
      { ...BASE_CTX, inputs: { ...BASE_CTX.inputs, verdict: "already-shipped" } },
      stub,
    );

    expect(res.proposals).toHaveLength(2);
    expect(res.proposals.map((p) => p.target_file)).toContain("memory/product/positioning.md");
  });
});
