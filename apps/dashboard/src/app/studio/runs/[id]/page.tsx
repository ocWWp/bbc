import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireActor } from "@/lib/auth/require-user";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { OutputBlock } from "@/lib/studio/output-blocks";
import RunActions from "./RunActions";

export const metadata = {
  title: "Studio run · BBC",
};

export const dynamic = "force-dynamic";

const RUN_ID_RE = /^[0-9a-fA-F-]{36}$/;

function studioForTemplate(templateId: string): string {
  if (templateId.startsWith("eng:")) return "engineering";
  if (templateId.startsWith("founder:")) return "founder";
  if (templateId.startsWith("design:")) return "designer";
  return "marketing";
}

function renderBlocks(blocks: OutputBlock[]): string {
  return blocks
    .map((b) => {
      if (b.kind === "plain") return b.props.text;
      if (b.kind === "blog_draft") {
        const sub = b.props.subtitle ? `*${b.props.subtitle}*\n\n` : "";
        return `# ${b.props.title}\n\n${sub}${b.props.body_markdown}`;
      }
      if (b.kind === "x_post") return b.props.text;
      if (b.kind === "threads_post") return b.props.text;
      if (b.kind === "linkedin_post") {
        const head = b.props.headline ? `**${b.props.headline}**\n\n` : "";
        return `${head}${b.props.body}`;
      }
      if (b.kind === "x_thread") {
        return b.props.posts.map((p, i) => `${i + 1}/ ${p.text}`).join("\n\n");
      }
      if (b.kind === "script") {
        const beats = b.props.beats.map((x) => `[${x.time}] ${x.line}`).join("\n");
        const cta = b.props.cta ? `\n\n— ${b.props.cta}` : "";
        return `**Hook:** ${b.props.hook}\n\n${beats}${cta}`;
      }
      return JSON.stringify(b, null, 2);
    })
    .join("\n\n---\n\n");
}

export default async function StudioRunPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!RUN_ID_RE.test(id)) notFound();

  const a = await requireActor();
  if (!a.ok) {
    redirect(`/auth/signin?callbackUrl=${encodeURIComponent(`/studio/runs/${id}`)}`);
  }

  const supabase = await getSupabaseServerClient();
  const { data: row } = await supabase
    .from("studio_runs")
    .select("id, template_id, task, inputs, output_blocks, cited_memory_ids, status, created_at, error_message")
    .eq("id", id)
    .eq("tenant_id", a.actor.tenant_id)
    .single();

  if (!row) notFound();

  const run = row as {
    id: string;
    template_id: string;
    task: string;
    inputs: Record<string, string> | null;
    output_blocks: OutputBlock[];
    cited_memory_ids: string[];
    status: string;
    created_at: string;
    error_message: string | null;
  };

  const citedIds = run.cited_memory_ids ?? [];
  const { data: titleRows } = citedIds.length
    ? await supabase
        .from("memory_files")
        .select("id, title, type")
        .in("id", citedIds)
    : { data: [] };

  type TitleRow = { id: string; title: string | null; type: string | null };
  const cited = ((titleRows ?? []) as TitleRow[]).map((r) => ({
    id: r.id,
    title: (r.title ?? "").trim() || "untitled",
    type: r.type ?? null,
  }));

  const studio = studioForTemplate(run.template_id);
  const isOpen = run.status === "pending_review";
  const text = renderBlocks(run.output_blocks ?? []);

  return (
    <main className="mx-auto max-w-4xl px-4 sm:px-6 py-8 sm:py-12">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <Link
            href={`/studio/${studio}`}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            ← {studio} studio
          </Link>
          <h1 className="mt-1 text-2xl font-semibold">{run.task}</h1>
          <div className="mt-1 text-xs text-muted-foreground">
            <span>{run.template_id}</span>
            <span className="mx-2">·</span>
            <span>{new Date(run.created_at).toLocaleString()}</span>
            <span className="mx-2">·</span>
            <span className="font-medium">{run.status}</span>
          </div>
        </div>
        {isOpen && <RunActions runId={run.id} />}
      </header>

      {run.error_message && (
        <section className="mb-6 rounded-lg border border-red-500/40 bg-red-500/5 p-4 text-sm">
          <div className="font-medium">Generation error</div>
          <div className="mt-1 text-muted-foreground">{run.error_message}</div>
        </section>
      )}

      <article className="rounded-lg border border-border bg-background p-6">
        <pre className="whitespace-pre-wrap font-mono text-sm">{text}</pre>
      </article>

      {cited.length > 0 && (
        <section className="mt-6">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            Cited memories ({cited.length})
          </h2>
          <ul className="space-y-1">
            {cited.map((c) => (
              <li key={c.id} className="text-sm">
                <span className="text-muted-foreground">{c.type ?? "memory"}</span>
                <span className="mx-2">·</span>
                <span>{c.title}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
