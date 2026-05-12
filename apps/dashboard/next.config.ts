import path from "node:path";
import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const config: NextConfig = {
  // Default app router behavior. Server actions are enabled by default in 16.x.
  // No experimental flags required for V1.

  // Standalone build: emits .next/standalone/ with only the deps the server
  // actually imports. Used by the docker-compose self-host path (see
  // apps/dashboard/Dockerfile) — shrinks the runtime image significantly
  // versus copying full node_modules. Cloudflare Workers (cf:build) and
  // local `next dev` ignore this.
  output: "standalone",

  // Tell the tracer to walk up to the monorepo root so workspace deps
  // (@bbc/store) are included in the standalone bundle.
  outputFileTracingRoot: path.join(__dirname, "../.."),

  // Absorbed-route bookmarks: top-level paths that were folded into /settings
  // during the Claude Design port. 308 keeps the method on redirect so a
  // bookmark on /api-keys or an old doc link still lands correctly.
  async redirects() {
    return [
      { source: "/api-keys", destination: "/settings/api-keys", permanent: true },
      { source: "/team",     destination: "/settings/team",     permanent: true },
      { source: "/tools",    destination: "/settings/tools",    permanent: true },
      { source: "/bindings", destination: "/settings/bindings", permanent: true },
      { source: "/log",      destination: "/settings/log",      permanent: true },
      { source: "/skills",   destination: "/settings/skills",   permanent: true },
    ];
  },
};

export default withSentryConfig(config, {
  silent: true,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  sourcemaps: { deleteSourcemapsAfterUpload: true },
  disableLogger: true,
});
