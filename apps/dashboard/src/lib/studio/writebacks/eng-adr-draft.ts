import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { registerWritebackEmitter } from "./registry";
import {
  blocksToMarkdown,
  proposalId,
  slugify,
  type WritebackContext,
  type WritebackEmitter,
  type WritebackResult,
} from "./types";

// eng:adr-draft writeback. The single cleanest BBC flywheel story: the
// studio generates an ADR draft, the founder accepts, and the ADR becomes
// a pending queue_items proposal targeting memory/decisions/. From draft to
// decision-memory in one click -- no copy-pasting markdown into a file.
//
// The proposal's body IS the drafted ADR markdown verbatim. The founder
// reviews + accepts from /queue, which (in DB-mode) writes a memory_files
// row of type=decision via the standard accept_proposal() SQL function.
//
// Title extraction: the drafted ADR's first H1 line is the canonical
// title. If the LLM disobeyed the prompt scaffold and didn't emit one,
// fall back to the studio run's task field.

const TEMPLATE_ID = "eng:adr-draft";

type SupabaseDb = SupabaseClient<Database>;

function extractTitle(markdown: string, fallback: string): string {
  const firstH1 = markdown.match(/^#\s+(.+?)\s*$/m);
  if (firstH1?.[1]) {
    // Strip a leading "ADR-NNNN:" if the LLM emitted one -- the queue
    // accept-side renumbers, so the placeholder is just noise.
    return firstH1[1].replace(/^ADR-[N0-9-]+:\s*/i, "").trim().slice(0, 120);
  }
  return fallback.slice(0, 120);
}

const emitter: WritebackEmitter = {
  templateId: TEMPLATE_ID,
  async emit(ctx: WritebackContext, supabase: SupabaseDb): Promise<WritebackResult> {
    const adrMarkdown = blocksToMarkdown(ctx.outputBlocks);
    const title = extractTitle(adrMarkdown, ctx.task);
    const slug = slugify(title);
    const now = new Date().toISOString();
    const adrPropId = proposalId("adr", slug);

    const body = [
      adrMarkdown,
      ``,
      `---`,
      `_Filed by Engineering Studio (run \`${ctx.runId}\`) on ${now.slice(0, 10)}._`,
      `_Accepting this proposal writes a \`decision\` memory_file. Edit the ADR before accepting if the studio's draft needs revision._`,
    ].join("\n");

    const { error } = await supabase.from("queue_items").insert({
      tenant_id: ctx.tenantId,
      proposal_id: adrPropId,
      status: "pending",
      body,
      frontmatter: {
        proposed_by: ctx.userActor,
        proposed_at: now,
        target_layer: "main",
        target_file: `memory/decisions/NNNN-${slug}.md`,
        change_kind: "add",
        diff_summary: `Add ADR: ${title}`,
        source: `studio:${TEMPLATE_ID}`,
        source_run_id: ctx.runId,
        memory_type: "decision",
        cited_memory_ids: ctx.citedMemoryIds,
      },
    });

    if (error) {
      return { proposals: [], artifacts: [] };
    }
    return {
      proposals: [
        {
          proposal_id: adrPropId,
          target_file: `memory/decisions/NNNN-${slug}.md`,
          diff_summary: `Add ADR: ${title}`,
        },
      ],
      artifacts: [],
    };
  },
};

registerWritebackEmitter(emitter);
export default emitter;
