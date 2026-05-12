import { redirect } from "next/navigation";
import { requireActor } from "@/lib/auth/require-user";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import "@/lib/studio/eng-templates";
import { listClientEngTemplates } from "@/lib/studio/eng-templates/registry";

import EngStudioClient, { type RecentEngRun } from "./EngStudioClient";

export const metadata = {
  title: "Engineering Studio · BBC",
};

export const dynamic = "force-dynamic";

export default async function EngineeringStudioPage() {
  const a = await requireActor();
  if (!a.ok) {
    redirect(`/auth/signin?callbackUrl=${encodeURIComponent("/studio/engineering")}`);
  }

  const templates = listClientEngTemplates();
  const knownIds = new Set(templates.map((t) => t.id));

  const supabase = await getSupabaseServerClient();
  const { data: recentRows } = await supabase
    .from("studio_runs")
    .select("id, template_id, task, inputs, status, created_at")
    .eq("tenant_id", a.actor.tenant_id)
    .like("template_id", "eng:%")
    .order("created_at", { ascending: false })
    .limit(8);

  type RecentRow = {
    id: string;
    template_id: string;
    task: string;
    inputs: Record<string, string> | null;
    status: string;
    created_at: string;
  };
  const recentRuns: RecentEngRun[] = ((recentRows ?? []) as RecentRow[])
    .filter((r) => knownIds.has(r.template_id))
    .slice(0, 5)
    .map((r) => ({
      id: r.id,
      templateId: r.template_id,
      task: r.task,
      inputs: r.inputs ?? {},
      status: r.status,
      createdAt: r.created_at,
    }));

  return (
    <main className="mx-auto max-w-5xl px-4 sm:px-6 py-8 sm:py-12">
      <header className="mb-8 sm:mb-12">
        <div className="text-[11px] font-semibold tracking-[0.18em] uppercase text-muted-foreground">
          Engineering Studio
        </div>
        <h1 className="mt-2 text-3xl sm:text-4xl font-bold tracking-tight">
          What needs documenting?
        </h1>
        <p className="mt-2 text-muted-foreground text-base sm:text-lg max-w-2xl">
          ADRs, vendor proposals, tech-debt reviews — drafted from your brain&rsquo;s
          decisions and vendors, then handed back for your review.
        </p>
      </header>

      <EngStudioClient templates={templates} recentRuns={recentRuns} />
    </main>
  );
}
