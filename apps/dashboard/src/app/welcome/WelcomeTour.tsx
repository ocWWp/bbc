"use client";

import { useRouter } from "next/navigation";

const SKIP_KEY = "bbc.welcome.skipped";

type Props = {
  step: 1 | 2 | 3;
  tenantSlug: string;
  role: "admin" | "member" | "viewer";
};

export function WelcomeTour({ step, tenantSlug, role }: Props) {
  const router = useRouter();
  const total = 3;
  const isAdmin = role === "admin";

  function go(target: 1 | 2 | 3) {
    router.push(`/welcome?step=${target}`);
  }

  function done() {
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(SKIP_KEY, "1");
      } catch {
        /* noop */
      }
    }
    router.push("/");
  }

  return (
    <>
      <header style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 24 }}>
        <h1 style={{ margin: 0 }}>Welcome to BBC</h1>
        <button type="button" className="btn nav-signout" onClick={done}>
          Skip tour →
        </button>
      </header>
      <p className="muted" style={{ marginBottom: 32 }}>
        You're signed in as <strong>{role}</strong> in tenant <strong>{tenantSlug}</strong>. Three short
        screens explain how BBC works. Step <strong>{step}</strong> of {total}.
      </p>

      {step === 1 && <Screen1 />}
      {step === 2 && <Screen2 />}
      {step === 3 && <Screen3 isAdmin={isAdmin} />}

      <nav style={{ display: "flex", justifyContent: "space-between", marginTop: 32 }}>
        <button
          type="button"
          className="btn"
          onClick={() => go((step - 1) as 1 | 2 | 3)}
          disabled={step === 1}
        >
          ← Back
        </button>
        <span className="mono-sm muted">{step} / {total}</span>
        {step < total ? (
          <button type="button" className="btn primary" onClick={() => go((step + 1) as 1 | 2 | 3)}>
            Next →
          </button>
        ) : (
          <button type="button" className="btn primary" onClick={done}>
            Open dashboard →
          </button>
        )}
      </nav>
    </>
  );
}

function Screen1() {
  return (
    <section>
      <h2>1. Memory is the contract</h2>
      <p>
        Everything BBC governs lives in <code>memory/</code> — your decisions, voice, glossary, vendor bindings,
        team. Each file has a YAML frontmatter header (id, type, scope, layer, owning_layer, status) so agents
        can reason over it.
      </p>
      <p>
        The schema is defined once at <code>memory/_schema.md</code>. Storage adapts: files in
        self-host mode, RLS-gated rows in this hosted SaaS. The shape is the contract; the storage
        is just a binding.
      </p>
      <ul>
        <li>Add a new ADR: write a markdown file under <code>memory/decisions/</code>.</li>
        <li>Bump a vendor binding: edit <code>memory/ops/bindings.yaml</code>.</li>
        <li>Define a new term: add a row to <code>memory/glossary/terms.md</code>.</li>
      </ul>
      <p className="muted">Visit <a href="/bindings">/bindings</a> to see your tenant's current role→provider table.</p>
    </section>
  );
}

function Screen2() {
  return (
    <section>
      <h2>2. Use the queue</h2>
      <p>
        Cross-layer changes don't happen by editing files directly — they go through the proposal queue.
        A leaf or a member <em>proposes</em> a change; the Manager <em>reviews</em>; an admin
        <em> accepts</em> or <em>rejects</em>. The accepted/rejected proposal stays forever as the audit trail.
      </p>
      <p>The dashboard exposes the queue at:</p>
      <ul>
        <li><a href="/queue">/queue</a> — pending proposals + Accept/Reject buttons.</li>
        <li><a href="/queue/[id]">/queue/[id]</a> — single proposal detail (frontmatter + body + manager_review).</li>
        <li><a href="/log">/log</a> — operations audit (who did what, when).</li>
      </ul>
      <p className="muted">
        Role gates: Accept/Reject require <strong>member</strong> or <strong>admin</strong>; viewers can read
        but not mutate.
      </p>
    </section>
  );
}

function Screen3({ isAdmin }: { isAdmin: boolean }) {
  return (
    <section>
      <h2>3. Invite your team</h2>
      {isAdmin ? (
        <>
          <p>
            You're an admin in this tenant. To grow the team:
          </p>
          <ul>
            <li>Visit <a href="/team">/team</a> → invite by provider (email / GitHub / Google) + role.</li>
            <li>The invited identity signs up at <code>/auth/signin</code> and lands in this tenant
              with the role you set.</li>
            <li>To wire agents (Claude Desktop, Cursor) into BBC, issue an MCP token at <a href="/api-keys">/api-keys</a>.
              See <code>apps/mcp-server/README.md</code> for the wiring config.</li>
          </ul>
          <p className="muted">
            Roles: <strong>admin</strong> (full powers + member management), <strong>member</strong> (propose +
            accept/reject + read), <strong>viewer</strong> (read-only).
          </p>
        </>
      ) : (
        <>
          <p>
            You're a {""}<strong>{"member"}</strong> in this tenant. Things you can do:
          </p>
          <ul>
            <li>File proposals via <a href="/queue">/queue</a> (or via the BBC propose script if you have CLI access).</li>
            <li>Accept or Reject pending proposals you're qualified to decide.</li>
            <li>Read all memory + bindings + audit log.</li>
          </ul>
          <p className="muted">
            Need to invite teammates or issue agent API keys? Ask an admin to upgrade you, or to do
            those actions on your behalf.
          </p>
        </>
      )}
    </section>
  );
}
