import { redirect } from "next/navigation";
import { requireActor } from "@/lib/auth/require-user";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import "@/lib/studio/designer-templates";
import { listClientDesignerTemplates } from "@/lib/studio/designer-templates/registry";

import DesignerStudioClient, { type RecentDesignerRun } from "./DesignerStudioClient";

export const metadata = {
  title: "Designer Studio · BBC",
};

export const dynamic = "force-dynamic";

export default async function DesignerStudioPage() {
  const a = await requireActor();
  if (!a.ok) {
    redirect(`/auth/signin?callbackUrl=${encodeURIComponent("/studio/designer")}`);
  }

  const templates = listClientDesignerTemplates();
  const knownIds = new Set(templates.map((t) => t.id));

  const supabase = await getSupabaseServerClient();
  const { data: recentRows } = await supabase
    .from("studio_runs")
    .select("id, template_id, task, inputs, status, created_at")
    .eq("tenant_id", a.actor.tenant_id)
    .like("template_id", "design:%")
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
  const recentRuns: RecentDesignerRun[] = ((recentRows ?? []) as RecentRow[])
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
          Designer Studio
        </div>
        <h1 className="mt-2 text-3xl sm:text-4xl font-bold tracking-tight">
          What needs designing?
        </h1>
        <p className="mt-2 text-muted-foreground text-base sm:text-lg max-w-2xl">
          Visual specs, brand guideline entries, UI copy passes — drafted from
          your brain&rsquo;s voice and product positioning.
        </p>
      </header>

      <DesignerStudioClient templates={templates} recentRuns={recentRuns} />
    </main>
  );
}
