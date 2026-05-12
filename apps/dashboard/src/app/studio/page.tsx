import Link from "next/link";
import { redirect } from "next/navigation";
import { requireActor } from "@/lib/auth/require-user";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import "@/lib/studio/templates";
import "@/lib/studio/eng-templates";
import "@/lib/studio/founder-templates";
import "@/lib/studio/designer-templates";
import "@/lib/studio/support-templates";
import { listClientTemplates } from "@/lib/studio/templates/registry";
import { listClientEngTemplates } from "@/lib/studio/eng-templates/registry";
import { listClientFounderTemplates } from "@/lib/studio/founder-templates/registry";
import { listClientDesignerTemplates } from "@/lib/studio/designer-templates/registry";
import { listClientSupportTemplates } from "@/lib/studio/support-templates/registry";

export const metadata = {
  title: "Studio · BBC",
};

export const dynamic = "force-dynamic";

const STUDIOS = [
  {
    slug: "marketing",
    label: "Marketing",
    description:
      "X posts, threads, LinkedIn announcements, blog drafts, reel scripts — in your voice with citations.",
    templates: () => listClientTemplates(),
    templateMatcher: (id: string) => !id.includes(":"),
  },
  {
    slug: "engineering",
    label: "Engineering",
    description:
      "ADRs, vendor swap proposals, tech-debt reviews — grounded in your team's prior decisions and active vendors.",
    templates: () => listClientEngTemplates(),
    templateMatcher: (id: string) => id.startsWith("eng:"),
  },
  {
    slug: "founder",
    label: "Founder",
    description:
      "Strategic memos, board updates, weekly recaps — drafted from product positioning, decisions, and team.",
    templates: () => listClientFounderTemplates(),
    templateMatcher: (id: string) => id.startsWith("founder:"),
  },
  {
    slug: "designer",
    label: "Designer",
    description:
      "Visual specs, brand guideline entries, UI copy passes — grounded in your voice and product positioning.",
    templates: () => listClientDesignerTemplates(),
    templateMatcher: (id: string) => id.startsWith("design:"),
  },
  {
    slug: "support",
    label: "Support",
    description:
      "Customer replies, churn-save, incident posts, bug acks, feature-request triage — voice-grounded, decisions-aware, never auto-sent.",
    templates: () => listClientSupportTemplates(),
    templateMatcher: (id: string) => id.startsWith("support:"),
  },
] as const;

export default async function StudioIndexPage() {
  const a = await requireActor();
  if (!a.ok) {
    redirect(`/auth/signin?callbackUrl=${encodeURIComponent("/studio")}`);
  }

  const supabase = await getSupabaseServerClient();
  const { data: recentRows } = await supabase
    .from("studio_runs")
    .select("id, template_id, task, status, created_at")
    .eq("tenant_id", a.actor.tenant_id)
    .order("created_at", { ascending: false })
    .limit(12);

  type Row = {
    id: string;
    template_id: string;
    task: string;
    status: string;
    created_at: string;
  };
  const recent = (recentRows ?? []) as Row[];

  return (
    <main className="mx-auto max-w-5xl px-4 sm:px-6 py-8 sm:py-12">
      <header className="mb-8 sm:mb-12">
        <div className="text-[11px] font-semibold tracking-[0.18em] uppercase text-muted-foreground">
          Studio
        </div>
        <h1 className="mt-2 text-3xl sm:text-4xl font-bold tracking-tight">
          Pick a role agent
        </h1>
        <p className="mt-2 text-muted-foreground text-base sm:text-lg max-w-2xl">
          Each studio is a role-scoped agent that reads your brain and produces
          work in the shape that role makes. Same memory, different output.
        </p>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {STUDIOS.map((s) => {
          const recentCount = recent.filter((r) => s.templateMatcher(r.template_id)).length;
          const templates = s.templates();
          return (
            <Link
              key={s.slug}
              href={`/studio/${s.slug}`}
              className="rounded-lg border border-border p-5 transition-colors hover:bg-accent/50"
            >
              <div className="flex items-baseline justify-between">
                <div className="font-medium">{s.label} Studio</div>
                <div className="text-xs text-muted-foreground">
                  {templates.length} workflow{templates.length === 1 ? "" : "s"}
                  {recentCount > 0 && ` · ${recentCount} recent`}
                </div>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{s.description}</p>
              {templates.length > 0 && (
                <ul className="mt-3 space-y-1">
                  {templates.slice(0, 3).map((t) => (
                    <li
                      key={t.id}
                      className="text-xs text-muted-foreground truncate"
                    >
                      <span className="text-foreground/70">·</span> {t.label}
                    </li>
                  ))}
                  {templates.length > 3 && (
                    <li className="text-xs text-muted-foreground/70">
                      +{templates.length - 3} more
                    </li>
                  )}
                </ul>
              )}
            </Link>
          );
        })}
      </section>

      {recent.length > 0 && (
        <section className="mt-12">
          <h2 className="text-sm font-semibold tracking-wide uppercase text-muted-foreground mb-3">
            Recent runs across all studios
          </h2>
          <ul className="space-y-2">
            {recent.slice(0, 8).map((r) => (
              <li key={r.id} className="text-sm">
                <Link
                  href={`/studio/runs/${r.id}`}
                  className="hover:underline"
                >
                  <span className="text-muted-foreground">{r.template_id}</span>
                  <span className="mx-2">·</span>
                  <span>{r.task.slice(0, 120)}</span>
                </Link>
                <span className="ml-2 text-xs text-muted-foreground">
                  ({r.status})
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
