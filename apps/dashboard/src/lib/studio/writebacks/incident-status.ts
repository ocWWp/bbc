import { registerWritebackEmitter } from "./registry";
import {
  blocksToMarkdown,
  insertAuditArtifact,
  proposalId,
  slugify,
  type WritebackEmitter,
} from "./types";

// incident-status writeback.
//
// ALWAYS: source_artifact row capturing the final post markdown + component
// + status + start time. Past incidents become searchable history for
// future drafting and feed v1.1 follow-up-post drafting ("the last time
// the API went down, here's what we said").
//
// CONDITIONAL (current_status=resolved): propose a known-incidents glossary
// entry summarizing component + symptom + (rough) duration + one-line
// cause (if cause_summary was provided). This converts a reactive event
// into reusable product knowledge -- the BBC compounding move for incident
// posts. Skipped for Investigating/Identified/Monitoring statuses because
// the incident isn't done yet; an interim glossary entry would lock in a
// premature shape.

const emitter: WritebackEmitter = {
  templateId: "support:incident-status",
  async emit(ctx, supabase) {
    const post = blocksToMarkdown(ctx.outputBlocks);
    const component = (ctx.inputs.component ?? "").trim() || "(unnamed component)";
    const symptom = (ctx.inputs.symptom ?? "").trim();
    const status = (ctx.inputs.current_status ?? "investigating").trim() || "investigating";
    const scope = (ctx.inputs.impact_scope ?? "").trim();
    const cadence = (ctx.inputs.update_cadence ?? "30 min").trim();
    const cause = (ctx.inputs.cause_summary ?? "").trim();
    const now = new Date().toISOString();

    const auditTitle = `Incident post [${status}]: ${component}`;
    const auditContent = [
      `# ${auditTitle}`,
      ``,
      `**Component:** ${component}`,
      symptom ? `**Symptom:** ${symptom}` : "",
      `**Status at post:** ${status}`,
      scope ? `**Impact scope:** ${scope}` : "",
      `**Cadence promised:** ${cadence}`,
      cause ? `**Cause (founder-supplied):** ${cause}` : "",
      `**Source run:** ${ctx.runId}`,
      `**Accepted at:** ${now}`,
      ``,
      `## Post markdown (accepted)`,
      ``,
      post,
    ]
      .filter(Boolean)
      .join("\n");

    const auditSummary = `${status} post for ${component}${symptom ? `: ${symptom}` : ""}`;
    const artifact = await insertAuditArtifact(supabase, ctx, {
      title: auditTitle,
      content: auditContent,
      summary: auditSummary,
    });

    const artifacts = artifact ? [artifact] : [];
    const proposals: { proposal_id: string; target_file: string; diff_summary: string }[] = [];

    // CONDITIONAL: only on Resolved posts, propose a known-incidents
    // glossary entry. Skipped earlier because the shape isn't final until
    // resolution.
    if (status === "resolved") {
      const slug = slugify(`${component} ${symptom}`);
      const incidentPropId = proposalId("known-incident", slug);
      const incidentBody = [
        `# Known incident: ${component}${symptom ? ` -- ${symptom}` : ""}`,
        ``,
        `Append (or update) an entry in \`memory/support/known-incidents.md\` (a glossary memory used by future incident drafting) summarizing this resolved incident.`,
        ``,
        `## Entry`,
        ``,
        `- **Component:** ${component}`,
        symptom ? `- **Symptom:** ${symptom}` : "",
        scope ? `- **Impact scope:** ${scope}` : "",
        cause ? `- **Cause (founder-supplied):** ${cause}` : "- **Cause:** (founder fills in before accepting)",
        `- **First seen:** ${now.slice(0, 10)}`,
        `- **Source run:** ${ctx.runId}`,
        ``,
        `## Resolved post (for reference)`,
        ``,
        post.slice(0, 1500),
      ]
        .filter(Boolean)
        .join("\n");

      const { error } = await supabase.from("queue_items").insert({
        tenant_id: ctx.tenantId,
        proposal_id: incidentPropId,
        status: "pending",
        body: incidentBody,
        frontmatter: {
          proposed_by: ctx.userActor,
          proposed_at: now,
          target_layer: "manager",
          target_file: "memory/support/known-incidents.md",
          change_kind: "add",
          diff_summary: `Add known-incidents entry for ${component}.`,
          source: "studio:support:incident-status",
          source_run_id: ctx.runId,
        },
      });
      if (!error) {
        proposals.push({
          proposal_id: incidentPropId,
          target_file: "memory/support/known-incidents.md",
          diff_summary: `Add known-incidents entry for ${component}.`,
        });
      }
    }

    return { proposals, artifacts };
  },
};

registerWritebackEmitter(emitter);
export default emitter;
