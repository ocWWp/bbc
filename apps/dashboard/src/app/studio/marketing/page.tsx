import { redirect } from "next/navigation";
import { requireActor } from "@/lib/auth/require-user";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import "@/lib/studio/templates"; // side-effect registration
import { listClientTemplates } from "@/lib/studio/templates/registry";
import { StudioPageShell } from "@/components/studio/StudioPageShell";

import StudioClient, { type RerunSeed } from "./StudioClient";

export const metadata = {
  title: "Marketing Studio · BBC",
};

export const dynamic = "force-dynamic";

const RUN_ID_RE = /^[0-9a-fA-F-]{36}$/;

export default async function MarketingStudioPage({
  searchParams,
}: {
  searchParams: Promise<{ rerun?: string }>;
}) {
  const a = await requireActor();
  if (!a.ok) {
    redirect(`/auth/signin?callbackUrl=${encodeURIComponent("/studio/marketing")}`);
  }

  const templates = listClientTemplates();

  const authorHint = {
    name: a.actor.identifier,
    handle: a.actor.identifier.replace(/[^a-z0-9]+/gi, "").toLowerCase().slice(0, 16),
  };

  // ?rerun=<runId> reopens a past run pre-filled with its task + inputs. Only
  // honored when the run belongs to the tenant and its template still exists.
  let rerunSeed: RerunSeed | undefined;
  const { rerun } = await searchParams;
  if (rerun && RUN_ID_RE.test(rerun)) {
    const supabase = await getSupabaseServerClient();
    const { data: run } = await supabase
      .from("studio_runs")
      .select("template_id, task, inputs")
      .eq("id", rerun)
      .eq("tenant_id", a.actor.tenant_id)
      .single();
    if (run) {
      const r = run as {
        template_id: string;
        task: string;
        inputs: Record<string, string> | null;
      };
      const tpl = templates.find((t) => t.id === r.template_id);
      if (tpl) {
        rerunSeed = {
          templateId: tpl.id,
          label: tpl.label,
          task: r.task,
          inputs: r.inputs ?? {},
        };
      }
    }
  }

  return (
    <StudioPageShell role="marketing">
      <StudioClient templates={templates} authorHint={authorHint} rerunSeed={rerunSeed} />
    </StudioPageShell>
  );
}
