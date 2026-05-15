import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireActor } from "@/lib/auth/require-user";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { OutputBlock } from "@/lib/studio/output-blocks";
import { roleForTemplateId } from "@/lib/studio/template-id";
import RunActions from "./RunActions";

export const metadata = {
  title: "Studio run · BBC",
};

export const dynamic = "force-dynamic";

const RUN_ID_RE = /^[0-9a-fA-F-]{36}$/;

type RenderedBlock = {
  channel: string;
  body: string;
};

function blocksToRendered(blocks: OutputBlock[]): RenderedBlock[] {
  return blocks.map((b: OutputBlock) => {
    if (b.kind === "plain") return { channel: "plain", body: b.props.text };
    if (b.kind === "blog_draft") {
      const sub = b.props.subtitle ? `*${b.props.subtitle}*\n\n` : "";
      return {
        channel: `blog · ${b.props.title}`,
        body: `${sub}${b.props.body_markdown}`,
      };
    }
    if (b.kind === "x_post") return { channel: "x · post", body: b.props.text };
    if (b.kind === "threads_post") return { channel: "threads", body: b.props.text };
    if (b.kind === "linkedin_post") {
      const head = b.props.headline ? `**${b.props.headline}**\n\n` : "";
      return { channel: "linkedin", body: `${head}${b.props.body}` };
    }
    if (b.kind === "x_thread") {
      return {
        channel: `x · thread (${b.props.posts.length})`,
        body: b.props.posts.map((p, i) => `${i + 1}/ ${p.text}`).join("\n\n"),
      };
    }
    if (b.kind === "script") {
      const beats = b.props.beats.map((x) => `[${x.time}] ${x.line}`).join("\n");
      const cta = b.props.cta ? `\n\n— ${b.props.cta}` : "";
      return {
        channel: "script",
        body: `**Hook:** ${b.props.hook}\n\n${beats}${cta}`,
      };
    }
    if (b.kind === "doc") {
      const secs = b.props.sections?.length
        ? "\n\n" +
          b.props.sections.map((s) => `## ${s.heading}\n\n${s.body_markdown}`).join("\n\n")
        : "";
      return {
        channel: `doc · ${b.props.doc_type}`,
        body: `# ${b.props.title}\n\n${b.props.body_markdown}${secs}`,
      };
    }
    const unknownBlock = b as { kind: string; props: unknown };
    return {
      channel: unknownBlock.kind,
      body: JSON.stringify(unknownBlock.props, null, 2),
    };
  });
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

  // roleForTemplateId returns null only for legacy unprefixed marketing ids.
  const studio = roleForTemplateId(run.template_id) ?? "marketing";
  const isOpen = run.status === "pending_review";
  const blocks = blocksToRendered(run.output_blocks ?? []);

  const statusPill =
    run.status === "pending_review"
      ? "warn"
      : run.status === "accepted"
      ? "ok"
      : run.status === "rejected"
      ? "err"
      : "muted";

  return (
    <div className="container-narrow page">
      <header className="page-head">
        <div className="page-head-left">
          <div className="page-crumb">
            <Link href="/gallery">gallery</Link>
            <span className="sep">/</span>
            <Link href={`/studio/${studio}`}>{studio}</Link>
            <span className="sep">/</span>
            <span className="current mono">{run.id.slice(0, 8)}</span>
          </div>
          <h1 className="page-title">{run.task}</h1>
        </div>
      </header>

      {run.error_message && (
        <div className="banner err">
          <span className="dot" />
          <span style={{ flex: 1 }}>
            <strong>generation error:</strong> {run.error_message}
          </span>
        </div>
      )}

      <div className="run-header">
        <div>
          <div className="section-eyebrow">task</div>
          <p className="run-task">{run.task}</p>
          <div style={{ display: "flex", gap: 6, marginTop: 12, flexWrap: "wrap" }}>
            <span className="pill mono">template · {run.template_id}</span>
            {Object.entries(run.inputs ?? {}).slice(0, 4).map(([k]) => (
              <span key={k} className="pill mono">
                reads · {k}
              </span>
            ))}
          </div>
        </div>
        <div className="run-meta">
          <span>
            <span className={`pill ${statusPill}`}>{run.status}</span>
          </span>
          <span>filed {new Date(run.created_at).toISOString().slice(0, 16).replace("T", " ")}</span>
          <span>
            {blocks.length} block{blocks.length === 1 ? "" : "s"}
          </span>
        </div>
      </div>

      <div className="run-blocks">
        {blocks.length === 0 ? (
          <div className="empty lg">
            <div className="e-eyebrow">empty run</div>
            <h2 className="e-title">No output blocks.</h2>
            <p className="e-body">The studio finished but produced no blocks. Check the error message or re-run.</p>
          </div>
        ) : (
          blocks.map((b, i) => (
            <div className="run-block" key={i}>
              <div className="run-block-head">
                <span className="ch">{b.channel}</span>
                <span className="pill ok">
                  <span className="dot" /> drafted
                </span>
              </div>
              <div className="run-block-body">{b.body}</div>
            </div>
          ))
        )}
      </div>

      {cited.length > 0 && (
        <div className="card" style={{ padding: 0, marginTop: 20 }}>
          <div
            style={{
              padding: "14px 18px",
              borderBottom: "1px solid var(--paper-rule)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div className="section-eyebrow">cited memories · {cited.length}</div>
            <span className="pill muted">grounding for this run</span>
          </div>
          {cited.map((c) => (
            <Link
              key={c.id}
              href={`/brain/${c.id}`}
              className="card-row"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                textDecoration: "none",
                color: "inherit",
              }}
            >
              {c.type && (
                <span
                  className="tag"
                  style={{ ["--tag-color" as string]: `var(--t-${c.type})` }}
                >
                  <span className="dot" />
                  {c.type}
                </span>
              )}
              <span style={{ flex: 1, fontSize: 13.5, color: "var(--paper-ink-2)" }}>
                {c.title}
              </span>
              <span
                className="mono"
                style={{ fontSize: 11, color: "var(--paper-muted)" }}
              >
                {c.id.slice(0, 8)}
              </span>
            </Link>
          ))}
        </div>
      )}

      {isOpen && (
        <div className="run-foot">
          <div>
            <div className="section-eyebrow" style={{ marginBottom: 6 }}>
              on accept
            </div>
            <div className="help">
              Files structured proposals to{" "}
              <span className="mono" style={{ color: "var(--paper-ink)" }}>
                /queue
              </span>{" "}
              and stamps an audit artifact. Reject discards the draft only;
              nothing is written to memory.
            </div>
          </div>
          <RunActions runId={run.id} />
        </div>
      )}
    </div>
  );
}
