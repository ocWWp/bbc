import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { getSupabaseServiceClient } from "./server";

// Task 0h: ensure the service-role helper is callable and validates env.
// (The cookie-bearing getSupabaseServerClient is exercised in pages + actions
// at runtime — testing it here would require mocking next/headers.)

describe("getSupabaseServiceClient", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  });

  afterEach(() => {
    for (const key of Object.keys(process.env)) delete process.env[key];
    Object.assign(process.env, originalEnv);
  });

  it("throws when SUPABASE_SERVICE_ROLE_KEY is missing", () => {
    process.env.SUPABASE_URL = "https://example.supabase.co";
    expect(() => getSupabaseServiceClient()).toThrow(/SUPABASE_SERVICE_ROLE_KEY/);
  });

  it("throws when neither SUPABASE_URL nor NEXT_PUBLIC_SUPABASE_URL is set", () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-key";
    expect(() => getSupabaseServiceClient()).toThrow(/SUPABASE_URL/);
  });

  it("returns a client when both env vars are set", () => {
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-key";
    const client = getSupabaseServiceClient();
    expect(client).toBeDefined();
    expect(typeof client.from).toBe("function");
  });

  it("falls back to NEXT_PUBLIC_SUPABASE_URL when SUPABASE_URL is unset", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-key";
    const client = getSupabaseServiceClient();
    expect(client).toBeDefined();
  });
});
