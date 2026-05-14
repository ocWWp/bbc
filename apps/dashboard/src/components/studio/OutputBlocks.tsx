// Studio canvas renderer. Switches over OutputBlock.kind, calls the right
// preview card, and (optionally) renders a citations strip below the stack
// that lists the cited memories with their titles.

import Link from "next/link";
import type { OutputBlock } from "@/lib/studio/output-blocks";
import {
  BlogDraftCard,
  LinkedInCard,
  PlainCard,
  ScriptCard,
  ThreadsPostCard,
  XPostCard,
  XThreadCard,
  makeCitationContext,
  type CitationContext,
} from "./previews";

export type CitedMemory = {
  id: string;
  title: string;
  type: string | null;
};

type Props = {
  blocks: OutputBlock[];
  authorHint?: { name?: string; handle?: string; productName?: string; role?: string };
  citedMemories?: CitedMemory[];
  // When false, hides the citation strip (used during in-flight rendering
  // where we don't yet have memory titles).
  showCitationStrip?: boolean;
};

export function OutputBlocks({ blocks, authorHint, citedMemories, showCitationStrip = true }: Props) {
  const ctx = makeCitationContext();

  return (
    <div className="space-y-5">
      {blocks.map((b, i) => (
        <BlockRenderer key={i} block={b} ctx={ctx} authorHint={authorHint} />
      ))}
      {showCitationStrip && citedMemories && citedMemories.length > 0 ? (
        <CitationStrip ctx={ctx} memories={citedMemories} />
      ) : null}
    </div>
  );
}

function BlockRenderer({
  block,
  ctx,
  authorHint,
}: {
  block: OutputBlock;
  ctx: CitationContext;
  authorHint?: Props["authorHint"];
}) {
  switch (block.kind) {
    case "x_post":
      return <XPostCard text={block.props.text} authorHint={authorHint} ctx={ctx} />;
    case "x_thread":
      return <XThreadCard posts={block.props.posts} authorHint={authorHint} ctx={ctx} />;
    case "threads_post":
      return <ThreadsPostCard text={block.props.text} authorHint={authorHint} ctx={ctx} />;
    case "linkedin_post":
      return (
        <LinkedInCard
          headline={block.props.headline}
          body={block.props.body}
          hashtags={block.props.hashtags}
          authorHint={authorHint}
          ctx={ctx}
        />
      );
    case "blog_draft":
      return (
        <BlogDraftCard
          title={block.props.title}
          subtitle={block.props.subtitle}
          body_markdown={block.props.body_markdown}
          ctx={ctx}
        />
      );
    case "script":
      return (
        <ScriptCard
          hook={block.props.hook}
          beats={block.props.beats}
          cta={block.props.cta}
          ctx={ctx}
        />
      );
    case "plain":
      return <PlainCard text={block.props.text} ctx={ctx} />;
  }
}

function CitationStrip({
  ctx,
  memories,
}: {
  ctx: CitationContext;
  memories: CitedMemory[];
}) {
  // Only render memories that actually appeared in the rendered output.
  const cited = memories.filter((m) => ctx.numbers.has(m.id));
  if (cited.length === 0) return null;
  return (
    <div className="rounded-xl border bg-muted/40 px-4 py-3">
      <div className="text-[11px] uppercase tracking-[0.16em] font-semibold text-muted-foreground mb-2">
        Cites {cited.length} {cited.length === 1 ? "memory" : "memories"}
      </div>
      <ul className="flex flex-wrap gap-2">
        {cited
          .slice()
          .sort((a, b) => (ctx.numbers.get(a.id) ?? 0) - (ctx.numbers.get(b.id) ?? 0))
          .map((m) => (
            <li key={m.id}>
              <Link
                href={`/brain/${m.id}`}
                className="inline-flex items-center gap-1.5 rounded-full border bg-background px-2.5 py-1 text-xs font-medium hover:bg-accent hover:text-accent-foreground transition-colors"
              >
                <span className="tabular-nums text-muted-foreground">
                  [{ctx.numbers.get(m.id)}]
                </span>
                {m.type ? (
                  <span
                    className="text-[10px] uppercase tracking-widest text-muted-foreground"
                  >
                    {m.type}
                  </span>
                ) : null}
                <span className="max-w-[180px] truncate">{m.title || "untitled"}</span>
              </Link>
            </li>
          ))}
      </ul>
    </div>
  );
}
