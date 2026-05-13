// D-W4-5 — TTL guard test for the /library visit trigger.
//
// Doesn't exercise the actual generate (that needs a Supabase admin client
// and is covered by the rls suite + lifecycle.test.ts). This test pins the
// TTL behavior so a hot tenant doesn't regenerate on every page visit.

import { beforeEach, describe, expect, it, vi } from "vitest";

// adminClient() needs env vars in real use; here we return a dummy that the
// lifecycle mock below never actually touches.
vi.mock("@/lib/api-auth", () => ({
  adminClient: () => ({}),
}));

// Stub the lifecycle so any unintended call fails loudly.
const callsToGenerate: string[] = [];
vi.mock("./lifecycle", async () => {
  return {
    generateRecommendations: async (tenant_id: string) => {
      callsToGenerate.push(tenant_id);
      return {
        inserted: 0,
        reason: "ok" as const,
        diagnostics: {
          candidates: 0,
          dropped_existing_pending: 0,
          dropped_cooldown: 0,
          pending_before: 0,
        },
      };
    },
  };
});

vi.mock("./lifecycle-supabase", () => ({
  makeSupabaseLifecycleDb: () => ({}),
}));

import {
  __resetVisitTriggerForTests,
  triggerLibraryVisitGenerate,
} from "./generate";

const T1 = "00000000-0000-4000-8000-000000000001";
const T2 = "00000000-0000-4000-8000-000000000002";

beforeEach(() => {
  callsToGenerate.length = 0;
  __resetVisitTriggerForTests();
});

describe("triggerLibraryVisitGenerate — TTL guard", () => {
  it("first call for a tenant runs the generate", async () => {
    // adminClient() is stubbed to throw, but generate is mocked above; so the
    // mocked generateRecommendations() will fire instead. We assert via
    // callsToGenerate, not via the return value (the trigger swallows errors).
    const fired = await triggerLibraryVisitGenerate(T1);
    expect(fired).toBe(true);
    expect(callsToGenerate).toEqual([T1]);
  });

  it("second call within the TTL is a no-op", async () => {
    await triggerLibraryVisitGenerate(T1);
    callsToGenerate.length = 0;

    const fired = await triggerLibraryVisitGenerate(T1);
    expect(fired).toBe(false);
    expect(callsToGenerate).toEqual([]);
  });

  it("different tenants are tracked independently", async () => {
    await triggerLibraryVisitGenerate(T1);
    callsToGenerate.length = 0;

    const fired = await triggerLibraryVisitGenerate(T2);
    expect(fired).toBe(true);
    expect(callsToGenerate).toEqual([T2]);
  });

  it("rejects malformed tenant ids without firing", async () => {
    const fired = await triggerLibraryVisitGenerate("not-a-uuid");
    expect(fired).toBe(false);
    expect(callsToGenerate).toEqual([]);
  });
});
