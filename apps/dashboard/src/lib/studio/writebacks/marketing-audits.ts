import type { OutputBlock } from "@/lib/studio/output-blocks";
import { registerWritebackEmitter } from "./registry";
import {
  insertAuditArtifact,
  type WritebackEmitter,
} from "./types";

// Marketing-studio writeback emitters. Audit-only for v1.
//
// The marketing templates output content (tweets, threads, LinkedIn posts,
// reels, blog drafts). Each emitter writes a source_artifact row capturing
// what shipped, so the founder can search past posts ("did I already do a
// thread on X?") and a v1.1 consolidator can mine recurring high-engagement
// patterns into voice updates.
//
// All 10 marketing templates share the same factory because the audit shape
// is identical -- only the label and a richer block formatter vary by kind.
// The richer formatter handles the typed OutputBlock shapes (x_thread has
// posts[], blog_draft has title+body, etc.) because the default
// blocksToMarkdown helper only renders 'plain' nicely.

// Render a typed OutputBlock in a human/search-friendly markdown form. The
// default blocksToMarkdown helper in types.ts JSON-stringifies non-plain
// blocks; marketing audits want the actual content so future searches
// match on it.
function formatBlockForAudit(block: OutputBlock): string {
  switch (block.kind) {
    case "x_post": {
      const tags = block.props.hashtags?.length ? `\n\n${block.props.hashtags.join(" ")}` : "";
      return `**X post**\n\n${block.props.text}${tags}`;
    }
    case "x_thread": {
      const lines = block.props.posts.map((p, i) => `${i + 1}. ${p.text}`).join("\n\n");
      return `**X thread (${block.props.posts.length} posts)**\n\n${lines}`;
    }
    case "threads_post":
      return `**Threads post**\n\n${block.props.text}`;
    case "linkedin_post": {
      const head = block.props.headline ? `### ${block.props.headline}\n\n` : "";
      const tags = block.props.hashtags?.length ? `\n\n${block.props.hashtags.join(" ")}` : "";
      return `**LinkedIn post**\n\n${head}${block.props.body}${tags}`;
    }
    case "blog_draft": {
      const sub = block.props.subtitle ? `_${block.props.subtitle}_\n\n` : "";
      return `**Blog draft: ${block.props.title}**\n\n${sub}${block.props.body_markdown}`;
    }
    case "script": {
      const cta = block.props.cta ? `\n\n**CTA:** ${block.props.cta}` : "";
      const beats = block.props.beats.map((b) => `- **${b.time}** — ${b.line}`).join("\n");
      return `**Script**\n\n**Hook:** ${block.props.hook}\n\n${beats}${cta}`;
    }
    case "doc": {
      const secs = block.props.sections?.length
        ? "\n\n" +
          block.props.sections
            .map((s) => `### ${s.heading}\n\n${s.body_markdown}`)
            .join("\n\n")
        : "";
      return `**${block.props.doc_type}: ${block.props.title}**\n\n${block.props.body_markdown}${secs}`;
    }
    case "plain":
      return block.props.text;
  }
}

function formatBlocksForAudit(blocks: OutputBlock[]): string {
  return blocks.map(formatBlockForAudit).join("\n\n---\n\n");
}

// Templates with a non-trivial set of inputs benefit from echoing the input
// label in the audit summary so search works on intent, not just content.
function summarizeInputs(inputs: Record<string, string>): string {
  const keys = Object.keys(inputs).slice(0, 4);
  if (keys.length === 0) return "";
  return keys
    .map((k) => {
      const v = (inputs[k] ?? "").trim();
      if (!v) return null;
      return `${k}=${v.slice(0, 80)}`;
    })
    .filter(Boolean)
    .join("; ");
}

function makeMarketingAudit(templateId: string, label: string): WritebackEmitter {
  return {
    templateId,
    async emit(ctx, supabase) {
      const content = formatBlocksForAudit(ctx.outputBlocks);
      const now = new Date().toISOString();
      const taskShort = ctx.task.slice(0, 80) || "(no task framing)";
      const title = `${label}: ${taskShort}`;
      const inputSummary = summarizeInputs(ctx.inputs);

      const auditContent = [
        `# ${title}`,
        ``,
        `**Template:** ${templateId}`,
        `**Task:** ${ctx.task}`,
        inputSummary ? `**Inputs:** ${inputSummary}` : "",
        `**Source run:** ${ctx.runId}`,
        `**Accepted at:** ${now}`,
        ``,
        `## Output (accepted)`,
        ``,
        content,
      ]
        .filter(Boolean)
        .join("\n");

      const summary = `${label} — ${taskShort}${inputSummary ? ` (${inputSummary})` : ""}`;
      const artifact = await insertAuditArtifact(supabase, ctx, {
        title,
        content: auditContent,
        summary,
      });
      return { proposals: [], artifacts: artifact ? [artifact] : [] };
    },
  };
}

// Register every marketing template. Side-effect on import. Keeping the
// list explicit (instead of looping over the marketing template registry)
// so adding a writeback is a deliberate, reviewable action.
// Template ids carry the "marketing:" prefix after 0041_marketing_template_id_prefix.
// acceptStudioRun() looks up emitters by run.template_id; without the prefix here,
// prefixed runs would silently lose their writebacks (codex R3 caught this).
registerWritebackEmitter(makeMarketingAudit("marketing:blog-post-draft", "Blog post"));
registerWritebackEmitter(makeMarketingAudit("marketing:cross-platform-campaign", "Cross-platform campaign"));
registerWritebackEmitter(makeMarketingAudit("marketing:custom", "Custom marketing run"));
registerWritebackEmitter(makeMarketingAudit("marketing:hashtag-strategy", "Hashtag strategy"));
registerWritebackEmitter(makeMarketingAudit("marketing:linkedin-announcement", "LinkedIn announcement"));
registerWritebackEmitter(makeMarketingAudit("marketing:reel-script", "Reel script"));
registerWritebackEmitter(makeMarketingAudit("marketing:single-x-post", "X post"));
registerWritebackEmitter(makeMarketingAudit("marketing:threads-post", "Threads post"));
registerWritebackEmitter(makeMarketingAudit("marketing:tweet-thread", "Tweet thread"));
registerWritebackEmitter(makeMarketingAudit("marketing:voice-consistency-check", "Voice check"));

export { formatBlocksForAudit, makeMarketingAudit };
