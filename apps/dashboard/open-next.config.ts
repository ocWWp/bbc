// OpenNext config for Cloudflare Workers deployment. See
// https://opennext.js.org/cloudflare for the supported overrides.

import { defineCloudflareConfig } from "@opennextjs/cloudflare";

export default defineCloudflareConfig({
  // No KV/D1/R2 bindings yet — Supabase is the persistence layer.
  // ISR cache stays in-worker memory; that's fine for a small hosted demo.
  // When the demo outgrows that, swap in a KV-backed incrementalCache here.
});
