import Link from "next/link";
import { redirect } from "next/navigation";
import { requireActor } from "@/lib/auth/require-user";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import "@/lib/studio/templates";
import "@/lib/studio/eng-templates";
import "@/lib/studio/founder-templates";
import "@/lib/studio/designer-templates";
import "@/lib/studio/support-templates";
import "@/lib/studio/finance-templates";
import "@/lib/studio/legal-templates";
import "@/lib/studio/hr-templates";
import { listClientTemplates } from "@/lib/studio/templates/registry";
import { listClientEngTemplates } from "@/lib/studio/eng-templates/registry";
import { listClientFounderTemplates } from "@/lib/studio/founder-templates/registry";
import { listClientDesignerTemplates } from "@/lib/studio/designer-templates/registry";
import { listClientSupportTemplates } from "@/lib/studio/support-templates/registry";
import { listClientFinanceTemplates } from "@/lib/studio/finance-templates/registry";
import { listClientLegalTemplates } from "@/lib/studio/legal-templates/registry";
import { listClientHrTemplates } from "@/lib/studio/hr-templates/registry";

export const metadata = {
  title: "Studio · BBC",
};

export const dynamic = "force-dynamic";

/**
 * Studio chooser. Five role cards (Support · Engineering · Marketing ·
 * Founder · Designer) using the paper-palette `.studio-card` primitive.
 * Glyph tint maps to the supertag hue most associated with each role's
 * primary read-set — see the Claude Design bundle annotation for the
 * mapping rationale.
 */
const STUDIOS = [
  {
    slug: "support",
    label: "Support",
    glyph: "S",
    color: "var(--t-glossary)",
    description:
      "Customer replies, churn-save, incident posts, bug acks, feature-request triage — voice-grounded, decisions-aware, never auto-sent.",
    templates: () => listClientSupportTemplates(),
    templateMatcher: (id: string) => id.startsWith("support:"),
  },
  {
    slug: "engineering",
    label: "Engineering",
    glyph: "E",
    color: "var(--t-decision)",
    description:
      "ADRs, vendor swap proposals, tech-debt reviews — grounded in your team's prior decisions and active vendors.",
    templates: () => listClientEngTemplates(),
    templateMatcher: (id: string) => id.startsWith("eng:"),
  },
  {
    slug: "marketing",
    label: "Marketing",
    glyph: "M",
    color: "var(--t-voice)",
    description:
      "X posts, threads, LinkedIn announcements, blog drafts, reel scripts — in your voice with citations.",
    templates: () => listClientTemplates(),
    templateMatcher: (id: string) => !id.includes(":"),
  },
  {
    slug: "founder",
    label: "Founder",
    glyph: "F",
    color: "var(--t-skill)",
    description:
      "Strategic memos, board updates, weekly recaps — drafted from product positioning, decisions, and team.",
    templates: () => listClientFounderTemplates(),
    templateMatcher: (id: string) => id.startsWith("founder:"),
  },
  {
    slug: "designer",
    label: "Designer",
    glyph: "D",
    color: "var(--t-product)",
    description:
      "Visual specs, brand guideline entries, UI copy passes — grounded in your voice and product positioning.",
    templates: () => listClientDesignerTemplates(),
    templateMatcher: (id: string) => id.startsWith("design:"),
  },
  {
    slug: "finance",
    label: "Finance",
    glyph: "$",
    color: "var(--t-vendor)",
    description:
      "Board financials, budget memos, investor numbers, expense policy, runway analysis — the narrative around the numbers, never an invented figure.",
    templates: () => listClientFinanceTemplates(),
    templateMatcher: (id: string) => id.startsWith("finance:"),
  },
  {
    slug: "legal",
    label: "Legal",
    glyph: "§",
    color: "var(--t-source_artifact)",
    description:
      "NDAs, contractor agreements, IP assignments, ToS & privacy, employment terms — a drafting assistant, never a legal advisor. Every output is a draft for attorney review.",
    templates: () => listClientLegalTemplates(),
    templateMatcher: (id: string) => id.startsWith("legal:"),
  },
  {
    slug: "hr",
    label: "People",
    glyph: "P",
    color: "var(--t-team)",
    description:
      "Job descriptions, offer letters, onboarding plans, review templates, comp rationale — behavior-anchored, bias-flagged, every output a draft you personalize.",
    templates: () => listClientHrTemplates(),
    templateMatcher: (id: string) => id.startsWith("hr:"),
  },
] as const;

function relTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return iso;
  const diff = Math.max(0, Date.now() - t);
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(t).toISOString().slice(5, 10);
}

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
    .limit(20);

  type Row = {
    id: string;
    template_id: string;
    task: string;
    status: string;
    created_at: string;
  };
  const recent = (recentRows ?? []) as Row[];

  return (
    <div className="container page">
      <header className="page-head">
        <div className="page-head-left">
          <div className="page-crumb">
            <Link href="/queue">acme</Link>
            <span className="sep">/</span>
            <span className="current">studio</span>
          </div>
          <h1 className="page-title">
            pick a <span className="serif">studio</span>.
          </h1>
          <p className="page-blurb">
            Each studio is a role-shaped surface that reads a specific slice of
            memory and drafts outputs in that voice. On accept, the studio files
            structured proposals back to <span className="mono">/queue</span>.
          </p>
        </div>
        <div className="page-actions">
          <span className="pill muted">{recent.length} recent run{recent.length === 1 ? "" : "s"}</span>
        </div>
      </header>

      <div className="studio-grid">
        {STUDIOS.map((s) => {
          const studioRecent = recent.filter((r) => s.templateMatcher(r.template_id)).slice(0, 3);
          const templates = s.templates();
          return (
            <Link
              key={s.slug}
              href={`/studio/${s.slug}`}
              className="studio-card"
              style={{ ["--role-color" as string]: s.color }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div className="role-glyph">{s.glyph}</div>
                <span className="pill muted">
                  {templates.length} workflow{templates.length === 1 ? "" : "s"}
                </span>
              </div>
              <h3 className="role-name">{s.label}</h3>
              <p className="role-desc">{s.description}</p>
              <div className="role-runs">
                {studioRecent.length === 0 ? (
                  <div className="run">
                    <span className="what" style={{ fontStyle: "italic" }}>no runs yet</span>
                    <span>—</span>
                  </div>
                ) : (
                  studioRecent.map((r) => (
                    <div key={r.id} className="run">
                      <span className="what">{r.task.slice(0, 60)}</span>
                      <span>{relTime(r.created_at)}</span>
                    </div>
                  ))
                )}
              </div>
            </Link>
          );
        })}
      </div>

      {recent.length > 0 && (
        <section style={{ marginTop: 40 }}>
          <div className="section-eyebrow" style={{ marginBottom: 14 }}>
            recent runs across all studios
          </div>
          <div className="card" style={{ padding: 0 }}>
            {recent.slice(0, 8).map((r, i) => (
              <Link
                key={r.id}
                href={`/studio/runs/${r.id}`}
                className="card-row"
                style={{
                  display: "grid",
                  gridTemplateColumns: "160px 1fr 80px",
                  gap: 16,
                  alignItems: "center",
                  textDecoration: "none",
                  color: "inherit",
                  borderBottom:
                    i === Math.min(7, recent.length - 1) ? "none" : undefined,
                }}
              >
                <span className="mono" style={{ fontSize: 11.5, color: "var(--paper-muted)" }}>
                  {r.template_id}
                </span>
                <span style={{ fontSize: 13.5, color: "var(--paper-ink-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {r.task}
                </span>
                <span className="pill muted" style={{ justifySelf: "end" }}>
                  {r.status}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
