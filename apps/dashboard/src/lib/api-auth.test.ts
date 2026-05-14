import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock the supabase admin client BEFORE importing the module under test, so
// the SDK never tries to read SUPABASE env vars during the import side-effect.
vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    rpc: vi.fn(),
  })),
}));

import {
  resolveBearer,
  scopeAllows,
  type ResolvedKey,
} from "./api-auth";

describe("scopeAllows", () => {
  it("admin can do everything", () => {
    expect(scopeAllows("admin", "read")).toBe(true);
    expect(scopeAllows("admin", "write")).toBe(true);
    expect(scopeAllows("admin", "admin")).toBe(true);
  });

  it("write can read + write but not admin", () => {
    expect(scopeAllows("write", "read")).toBe(true);
    expect(scopeAllows("write", "write")).toBe(true);
    expect(scopeAllows("write", "admin")).toBe(false);
  });

  it("read can only read", () => {
    expect(scopeAllows("read", "read")).toBe(true);
    expect(scopeAllows("read", "write")).toBe(false);
    expect(scopeAllows("read", "admin")).toBe(false);
  });
});

describe("resolveBearer — token shape validation", () => {
  beforeEach(() => {
    // Provide minimal env so adminClient() doesn't blow up when reached.
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-service-role-key";
  });

  it("returns null for a null header", async () => {
    expect(await resolveBearer(null)).toBeNull();
  });

  it("returns null for a header that doesn't start with Bearer", async () => {
    expect(await resolveBearer("Basic abc")).toBeNull();
    expect(await resolveBearer("Token bbc_abc.def")).toBeNull();
  });

  it("returns null for a malformed bbc token (no dot)", async () => {
    expect(await resolveBearer("Bearer bbc_keyidwithoutsecret")).toBeNull();
  });

  it("returns null for a token missing the bbc_ prefix", async () => {
    expect(await resolveBearer("Bearer abc_123.def456")).toBeNull();
  });

  it("returns null for a token with invalid characters in the secret half", async () => {
    // Secret half must be lowercase hex per the regex; uppercase + symbols rejected.
    expect(await resolveBearer("Bearer bbc_validkey.ZZZNOT-HEX!")).toBeNull();
  });

  it("calls the RPC when the token is well-formed", async () => {
    const { createClient } = await import("@supabase/supabase-js");
    // Replace the createClient mock to capture the rpc call.
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          out_tenant_id: "tenant-uuid-1",
          out_scope: "read",
          out_key_id: "abc123",
          out_role: null,
        },
      ],
      error: null,
    });
    (createClient as ReturnType<typeof vi.fn>).mockReturnValueOnce({ rpc });

    const result = await resolveBearer("Bearer bbc_abc123.deadbeef01234567");

    expect(result).toEqual<ResolvedKey>({
      tenant_id: "tenant-uuid-1",
      scope: "read",
      role: null,
    });
    expect(rpc).toHaveBeenCalledWith("resolve_api_key", {
      p_token: "bbc_abc123.deadbeef01234567",
    });
  });

  it("returns null when the RPC reports an error", async () => {
    const { createClient } = await import("@supabase/supabase-js");
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: "boom" } });
    (createClient as ReturnType<typeof vi.fn>).mockReturnValueOnce({ rpc });
    expect(await resolveBearer("Bearer bbc_abc123.deadbeef01234567")).toBeNull();
  });

  it("returns null when the RPC returns an empty array", async () => {
    const { createClient } = await import("@supabase/supabase-js");
    const rpc = vi.fn().mockResolvedValue({ data: [], error: null });
    (createClient as ReturnType<typeof vi.fn>).mockReturnValueOnce({ rpc });
    expect(await resolveBearer("Bearer bbc_abc123.deadbeef01234567")).toBeNull();
  });

  it("returns null when the RPC throws", async () => {
    const { createClient } = await import("@supabase/supabase-js");
    const rpc = vi.fn().mockRejectedValue(new Error("network"));
    (createClient as ReturnType<typeof vi.fn>).mockReturnValueOnce({ rpc });
    expect(await resolveBearer("Bearer bbc_abc123.deadbeef01234567")).toBeNull();
  });
});
