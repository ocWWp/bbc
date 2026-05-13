import type { Metadata } from "next";
import { LibraryClient } from "./_components/LibraryClient";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Library · BBC" };

// Visual port of the Claude Design /library surface. Fixture data lives in
// _data.ts; real Skills + Connectors + Recommendations land via the schema
// migrations described in docs/plans/2026-05-12-bbc-launch-design.md (week 1+).
// The Providers tab will rewire onto readProviders() + readBindings() once
// the visual port is verified.
export default function LibraryPage() {
  return <LibraryClient />;
}
