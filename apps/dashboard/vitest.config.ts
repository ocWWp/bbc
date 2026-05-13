import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

// Task 0c of v1.5 launch polish: include test/ + tsx so component/DOM tests
// run under the default `pnpm test`. Exclude test/rls/** — those need a live
// Supabase database and run via the separate vitest.rls.config.ts.
//
// Environment routing: default is node. DOM tests opt in via the file-level
// pragma `// @vitest-environment jsdom` at the top of the test file.
// `environmentMatchGlobs` was removed in vitest 4; per-file pragmas are the
// supported replacement.

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    alias: {
      // Next.js "server-only" is a marker module that throws if imported into
      // a client bundle. In tests, alias it to a no-op so files like
      // src/lib/api-auth.ts (which have `import "server-only"`) can be tested.
      "server-only": resolve(__dirname, "test/stubs/server-only.ts"),
    },
  },
  test: {
    environment: "node",
    include: [
      "src/**/*.test.ts",
      "src/**/*.test.tsx",
      "test/**/*.test.ts",
      "test/**/*.test.tsx",
    ],
    exclude: ["**/node_modules/**", "test/rls/**"],
    globals: false,
  },
});
