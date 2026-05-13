// Separate vitest config for RLS tests.
//
// Reason for the split: RLS tests require live Supabase env vars and hit the
// real staging DB, so they can't run in unit-test CI. Default `pnpm test`
// stays unchanged; `pnpm test:rls` explicitly runs against the live project.
//
// Required env (load from apps/dashboard/.env.local or shell):
//   - NEXT_PUBLIC_SUPABASE_URL
//   - NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
//   - SUPABASE_SERVICE_ROLE_KEY

import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    alias: {
      "server-only": resolve(__dirname, "test/stubs/server-only.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["test/rls/**/*.test.ts"],
    globals: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
