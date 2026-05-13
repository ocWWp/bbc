// D-W3-6 tests for the Library connectors-tab reader.

import { describe, expect, it } from "vitest";
import { readTenantConnectors, type InstalledConnector } from "./read-tenant-connectors";
import type { SupabaseClient } from "@supabase/supabase-js";

type RawRow = {
  id: string;
  connector_id: string;
  last_sync_status: string | null;
  last_sync_at: string | null;
  last_sync_error: string | null;
  installed_at: string;
};

function fakeSupabase(rows: RawRow[] | null, error: unknown = null): SupabaseClient {
  const builder = {
    select: () => builder,
    eq: () => builder,
    is: () => builder,
    order: () => Promise.resolve({ data: rows, error }),
  };
  return { from: () => builder } as unknown as SupabaseClient;
}

const sample = (overrides: Partial<RawRow> = {}): RawRow => ({
  id: "row-1",
  connector_id: "github",
  last_sync_status: "ok",
  last_sync_at: "2026-05-12T12:00:00Z",
  last_sync_error: null,
  installed_at: "2026-05-01T00:00:00Z",
  ...overrides,
});

describe("readTenantConnectors", () => {
  it("returns an empty map on DB error or no rows", async () => {
    const a = await readTenantConnectors(fakeSupabase(null, new Error("boom")));
    expect(a.size).toBe(0);
    const b = await readTenantConnectors(fakeSupabase([]));
    expect(b.size).toBe(0);
  });

  it("maps rows keyed by connector_id", async () => {
    const rows = [
      sample({ connector_id: "github", last_sync_status: "ok" }),
      sample({ id: "row-2", connector_id: "webhook-generic", last_sync_status: "partial" }),
    ];
    const out = await readTenantConnectors(fakeSupabase(rows));
    expect(out.size).toBe(2);
    expect(out.get("github")?.status).toBe("ok");
    expect(out.get("webhook-generic")?.status).toBe("partial");
  });

  it("normalizes unknown status to null", async () => {
    const out = await readTenantConnectors(
      fakeSupabase([sample({ last_sync_status: "definitely_not_a_status" })]),
    );
    expect(out.get("github")?.status).toBeNull();
  });

  it("first row wins when a connector has multiple active rows", async () => {
    // Query orders by installed_at desc, so the *latest* install row is the
    // map entry that survives — older orphans are silently dropped.
    const rows = [
      sample({ id: "newer", installed_at: "2026-05-10T00:00:00Z", last_sync_status: "ok" }),
      sample({ id: "older", installed_at: "2026-04-01T00:00:00Z", last_sync_status: "auth_expired" }),
    ];
    const out = await readTenantConnectors(fakeSupabase(rows));
    expect(out.get("github")?.row_id).toBe("newer");
    expect(out.get("github")?.status).toBe("ok");
  });

  it("preserves all status fields on the InstalledConnector value", async () => {
    const out = await readTenantConnectors(
      fakeSupabase([
        sample({
          last_sync_status: "auth_expired",
          last_sync_at: "2026-05-12T11:00:00Z",
          last_sync_error: "token revoked",
        }),
      ]),
    );
    const got = out.get("github");
    expect(got).toMatchObject<Partial<InstalledConnector>>({
      connector_id: "github",
      status: "auth_expired",
      last_sync_error: "token revoked",
      last_sync_at: "2026-05-12T11:00:00Z",
    });
  });
});
