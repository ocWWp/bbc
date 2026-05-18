import Link from "next/link";
import { redirect } from "next/navigation";
import { requireActor } from "@/lib/auth/require-user";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { isHostedDemoMode } from "@/lib/secrets/tenant-keys";
import ResetDemoButton from "./ResetDemoButton";

export const metadata = {
  title: "Settings · BBC",
};

export const dynamic = "force-dynamic";

export default async function SettingsGeneral() {
  const a = await requireActor();
  if (!a.ok) {
    redirect(`/auth/signin?callbackUrl=${encodeURIComponent("/settings")}`);
  }

  const supabase = await getSupabaseServerClient();
  const { data: tenant } = await supabase
    .from("tenants")
    .select("slug, created_at")
    .eq("id", a.actor.tenant_id)
    .maybeSingle();

  const { count: memberCount } = await supabase
    .from("tenant_members")
    .select("*", { count: "exact", head: true })
    .eq("tenant_id", a.actor.tenant_id);

  return (
    <>
      <div className="set-block">
        <div className="set-block-head">
          <div>
            <div className="h">Workspace</div>
            <div className="sub">Identity of this multi-tenant scope.</div>
          </div>
          <span className="pill ok">
            <span className="dot" /> active
          </span>
        </div>
        <div className="set-block-rows">
          <div className="row">
            <span className="k">slug</span>
            <span className="v">
              <code>{tenant?.slug ?? "—"}</code>
            </span>
          </div>
          <div className="row">
            <span className="k">your role</span>
            <span className="v">
              <span className="pill muted">{a.actor.role}</span>
            </span>
          </div>
          <div className="row">
            <span className="k">members</span>
            <span className="v">
              {memberCount ?? 0} member{memberCount === 1 ? "" : "s"} —{" "}
              <Link href="/settings/team" style={{ color: "var(--paper-accent)" }}>
                manage
              </Link>
            </span>
          </div>
          <div className="row">
            <span className="k">storage</span>
            <span className="v">
              Supabase Postgres · RLS-gated · workspace_id = <code>{a.actor.tenant_id.slice(0, 8)}…</code>
            </span>
          </div>
          <div className="row">
            <span className="k">created</span>
            <span className="v">
              <span className="mono">
                {tenant?.created_at
                  ? new Date(tenant.created_at).toISOString().slice(0, 10)
                  : "—"}
              </span>
            </span>
          </div>
        </div>
      </div>

      <div className="set-block">
        <div className="set-block-head">
          <div>
            <div className="h">Studios &amp; agents</div>
            <div className="sub">Per-role bindings and provider tools.</div>
          </div>
        </div>
        <div className="set-block-rows">
          <div className="row">
            <span className="k">provider keys</span>
            <span className="v">BYO Anthropic / OpenAI keys for tenant-scoped runs</span>
            <Link href="/settings/keys" className="btn btn-ghost">
              configure
            </Link>
          </div>
          <div className="row">
            <span className="k">bindings</span>
            <span className="v">Which memory types each studio can read &amp; write</span>
            <Link href="/settings/bindings" className="btn btn-ghost">
              edit
            </Link>
          </div>
          <div className="row">
            <span className="k">tools</span>
            <span className="v">Full F1 provider catalog — what each adapter does</span>
            <Link href="/settings/tools" className="btn btn-ghost">
              browse
            </Link>
          </div>
          <div className="row">
            <span className="k">skills</span>
            <span className="v">Composable skills role agents can invoke mid-run</span>
            <Link href="/settings/skills" className="btn btn-ghost">
              browse
            </Link>
          </div>
        </div>
      </div>

      {isHostedDemoMode() && a.actor.tenant_slug === "demo-acme" && (
        <div className="set-block">
          <div className="set-block-head">
            <div>
              <div className="h">Hosted demo</div>
              <div className="sub">
                This tenant is the public demo fixture. Resetting wipes all
                memories, proposals, and connector state, then re-seeds the
                "Acme" fixture from scratch.
              </div>
            </div>
            <span className="pill muted">demo</span>
          </div>
          <div className="set-block-rows">
            <div className="row">
              <span className="k">fixture</span>
              <span className="v">
                58 memory rows · 2 installed skills · 1 Notion connector · 3 pending recommendations
              </span>
              <ResetDemoButton disabled={a.actor.role !== "admin"} />
            </div>
          </div>
        </div>
      )}

      <div className="set-block">
        <div className="set-block-head">
          <div>
            <div className="h">Audit &amp; data</div>
            <div className="sub">Every accept/reject is logged in Postgres forever.</div>
          </div>
        </div>
        <div className="set-block-rows">
          <div className="row">
            <span className="k">activity log</span>
            <span className="v">All writes, accepts, rejects, key rotations</span>
            <Link href="/settings/log" className="btn btn-ghost">
              view
            </Link>
          </div>
          <div className="row">
            <span className="k">ops</span>
            <span className="v">Pending proposals across all studios</span>
            <Link href="/ops" className="btn btn-ghost">
              open
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
