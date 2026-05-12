import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

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
    include: ["src/**/*.test.ts"],
    globals: false,
  },
});
