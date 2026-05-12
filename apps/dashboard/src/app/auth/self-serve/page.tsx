import Link from "next/link";
import { redirect } from "next/navigation";
import { FlowBar } from "../../welcome/_steps/flow-bar";
import { BrainView } from "@/components/memory/BrainView";
import { SelfServeForm } from "./SelfServeForm";

export const dynamic = "force-dynamic";

export default function SelfServePage() {
  if (process.env.BBC_SIGNUP_MODE !== "open") {
    redirect("/auth/signin?error=self_serve_disabled");
  }

  return (
    <div className="flow">
      <FlowBar
        crumb="/auth/self-serve"
        right={
          <Link className="flow-bar-link" href="/auth/signin">
            <span>have an invite?</span>
            <span style={{ color: "var(--paper-ink)" }}>sign in instead ↗</span>
          </Link>
        }
      />
      <div className="auth">
        <section className="auth-form-col">
          <div className="auth-form">
            <span className="auth-eyebrow">
              <span className="dot" />
              <span>create a tenant · open signup</span>
            </span>
            <h1>your own brain, <span className="serif">fresh</span>.</h1>
            <p className="blurb">
              spin up a new workspace where you&apos;re the admin. seats are unlimited on
              self-hosted; on the hosted demo, the first three are free.
            </p>

            <SelfServeForm />

            <div className="auth-foot">
              <span className="legal">
                you become the owner of the new tenant. invite teammates from
                /settings/team after sign-in. tenants are isolated by Postgres RLS —
                workspaces never see each other&apos;s brains.
              </span>
            </div>
          </div>
        </section>

        <aside className="auth-aside">
          <div className="auth-aside-bg is-dim">
            <div className="brain-embed">
              <BrainView nodes={[]} embedded />
            </div>
          </div>
          <div className="auth-aside-head">
            <span className="lab">/// what you&apos;ll get on first load</span>
            <h2 className="h">
              a blank brain and the <span className="serif">welcome</span> flow.
            </h2>
            <p className="b">
              you&apos;ll land on <code style={{ fontFamily: "var(--font-geist-mono), monospace", background: "var(--paper)", border: "1px solid var(--paper-rule)", padding: "1px 5px", borderRadius: 4, fontSize: 12 }}>/welcome</code>,
              paste a doc or readme, and watch it become typed memory before anything
              is saved.
            </p>
          </div>

          <div className="auth-aside-spec">
            <div className="row"><span className="k">your role</span><span className="v">admin · owner</span></div>
            <div className="row"><span className="k">starts with</span><span className="v">0 memories · awaiting first dump</span></div>
            <div className="row"><span className="k">next step</span><span className="v" style={{ color: "var(--paper-accent)" }}>/welcome → brain dump</span></div>
          </div>
        </aside>
      </div>
    </div>
  );
}
