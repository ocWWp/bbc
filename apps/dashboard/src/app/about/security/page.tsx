import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Security — BBC",
  description:
    "What the BBC hosted demo encrypts, what it doesn't, and the blast-radius model for v1.",
};

export default function SecurityPage() {
  return (
    <article className="prose prose-neutral dark:prose-invert mx-auto max-w-3xl py-12">
      <h1>Security</h1>
      <p className="text-sm text-muted-foreground">Last updated: 2026-05-18</p>

      <p>
        This page describes the trust model of the BBC <a href="https://bbc.tools">hosted demo</a> in v1 — what is encrypted, what is not, and what happens in plausible compromise scenarios. Self-hosters control all of this independently; the security properties below describe one particular deployment of BBC (ours) and apply to your self-host only insofar as you reproduce the same infrastructure choices.
      </p>

      <p>
        BBC is AGPLv3. The code that implements every claim below is in <a href="https://github.com/ocWWp/bbc">the public repo</a>. If a sentence here disagrees with the code, the code wins — file an issue.
      </p>

      <h2>What we encrypt at the application layer</h2>
      <ul>
        <li>
          <strong>Your BYOK API keys</strong> — AES-256-GCM with a per-secret IV, auth tag pinned at 16 bytes. The 32-byte encryption key (<code>BBC_SECRET_ENCRYPTION_KEY</code>) lives in Cloudflare worker secrets, not in the database. Source: <code>apps/dashboard/src/lib/secrets/encryption.ts</code>.
        </li>
        <li>
          <strong>OAuth access + refresh tokens</strong> for connectors (Gmail, Drive, GitHub, Linear, Notion, generic webhook) — same AES-256-GCM scheme, stored in your tenant&apos;s <code>external_accounts</code> row.
        </li>
        <li>
          <strong>Auth-tag length is verified on every decrypt.</strong> If the key is missing or the ciphertext is corrupted, decryption throws — there is no plaintext fallback path. Source: <code>encryption.ts:25-28</code>.
        </li>
        <li>
          <strong>BYOK decrypt failure surfaces a distinct error</strong> rather than silently falling back to the shared hosted-demo key. If your key needs to be re-entered (after rotation, after a partial save), you get a clear signal — you are never billed against the demo pool while believing you&apos;re on your own key.
        </li>
      </ul>

      <h2>What we do not encrypt at the application layer</h2>
      <ul>
        <li>
          <strong>Memory rows</strong> — <code>memory_files.body</code>, <code>studio_runs.output</code>, queue proposal bodies, and the text of brain-dumps are stored as plaintext in Postgres. Only Supabase&apos;s disk-level encryption protects them at rest. A DB dump leaks readable company memory.
        </li>
        <li>
          <strong>What this means for you:</strong> treat memory content as if it were in a SaaS Notion workspace, not as if it were in a vault. Don&apos;t paste production secrets, raw customer PII, or regulated health/financial data into BBC. The product is designed for the kind of context a human would write in a strategy doc — voice rules, ADRs, vendor handles, glossary terms, team facts.
        </li>
        <li>
          <strong>Why not encrypt them?</strong> Studio composition and MCP queries need to read memory bodies on every request; envelope-encrypting at the application layer would require either a synchronous KMS call per read or a per-tenant data-encryption key cached in the worker, both of which add complexity we judged not worth the v1 trade-off. Application-layer encryption of memory is on the roadmap; see &quot;What&apos;s planned&quot; below.
        </li>
      </ul>

      <h2>The single point of failure</h2>
      <p>
        <code>BBC_SECRET_ENCRYPTION_KEY</code> lives in Cloudflare worker secrets. If that secret leaks, every tenant&apos;s encrypted API keys and OAuth tokens become decryptable by the leaker. We have no HSM, no envelope encryption, no per-tenant data-encryption keys, no customer-managed key option. This is a deliberate v1 simplification — one place to rotate, one place to back up, one place that can fail.
      </p>

      <h2>Maintainer-rogue blast radius</h2>
      <p>
        BBC&apos;s trust model in v1 is: <em>you trust the maintainer of the OSS repo you self-host, or you trust the operator of the hosted demo</em>. For bbc.tools, that&apos;s the BBC maintainer. The maintainer has access to:
      </p>
      <ul>
        <li>The Supabase service role (bypasses RLS — can read any tenant&apos;s memory).</li>
        <li>The Cloudflare worker secret store (can decrypt any tenant&apos;s BYOK keys + OAuth tokens).</li>
      </ul>
      <p>
        We have no key escrow, no third-party audit, no &quot;the maintainer can&apos;t read your data&quot; cryptographic property. If that is unacceptable for your data, self-host. The AGPLv3 license + the entire codebase exist so that you can.
      </p>

      <h2>What protects you</h2>
      <ul>
        <li>
          <strong>Row-level security on every memory table.</strong> Reads are scoped by <code>is_member_of(tenant_id)</code>; writes additionally require <code>is_operator_of(tenant_id)</code>. One tenant cannot read another tenant&apos;s memory through the application surface. Source: <code>apps/dashboard/supabase/migrations/</code>.
        </li>
        <li>
          <strong>Invite-only signup.</strong> A Supabase trigger raises <code>not_invited</code> for any sign-in attempt without a matching row in <code>tenant_invitations</code>. There is no open-registration form. The hosted demo runs in <code>BBC_SIGNUP_MODE=invite_only</code>.
        </li>
        <li>
          <strong>Immutable audit trail of accepted proposals.</strong> Every memory mutation passes through the queue. Accepted and rejected proposals are archived under <code>queue/_accepted/</code> and <code>queue/_rejected/</code>; in DB-mode the same archives are immutable via Postgres triggers. You can review who changed what.
        </li>
        <li>
          <strong>No third-party analytics, no tracking cookies.</strong> The session cookie required for sign-in is the only cookie on the hosted demo. No PostHog, no Segment, no Google Analytics. See <a href="/privacy">privacy</a>.
        </li>
      </ul>

      <h2>Blast-radius scenarios</h2>
      <table>
        <thead>
          <tr>
            <th>Scenario</th>
            <th>Outcome in v1</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Supabase database is dumped</td>
            <td>
              Encrypted BYOK keys + OAuth tokens stay encrypted (the encryption key is in Cloudflare, not Postgres). <strong>Memory rows leak as plaintext.</strong>
            </td>
          </tr>
          <tr>
            <td>Cloudflare worker secrets leak</td>
            <td>
              Full compromise of every tenant. BYOK keys + OAuth tokens become decryptable. Combined with a DB dump, everything is readable.
            </td>
          </tr>
          <tr>
            <td>One tenant&apos;s OAuth account is phished</td>
            <td>
              RLS confines the blast radius to that tenant. Other tenants are not exposed.
            </td>
          </tr>
          <tr>
            <td>Maintainer goes rogue</td>
            <td>
              Service role + worker secrets = full access to every tenant. No cryptographic mitigation. The mitigation is self-hosting.
            </td>
          </tr>
          <tr>
            <td>Supabase service-role key leaks</td>
            <td>
              Attacker bypasses RLS and can read every tenant&apos;s memory + connector metadata. Encrypted BYOK keys and OAuth tokens stay encrypted (the encryption key is in Cloudflare, not Postgres) — until a CF-secrets leak is combined with this one.
            </td>
          </tr>
          <tr>
            <td>Authenticated tenant abuses <code>/api/*</code></td>
            <td>
              v1 has no per-tenant rate-limit on API endpoints. An authenticated user can spam LLM calls. If the tenant has BYOK configured, the abuse spends their own provider budget. If they have not, the call falls back to the hosted demo&apos;s shared provider key — abuse can consume the shared key until demo caps or upstream provider limits stop it.
            </td>
          </tr>
        </tbody>
      </table>

      <h2>What&apos;s planned for post-v1</h2>
      <ul>
        <li>Application-layer encryption of memory bodies (envelope-encrypted with a per-tenant data key).</li>
        <li>Per-tenant rate-limiting on <code>/api/*</code> to prevent shared-key or BYOK-key abuse by an authenticated user.</li>
        <li>Application-level audit log of who read which memory (Supabase SQL-level only today).</li>
        <li>Key rotation and re-encryption tooling for <code>BBC_SECRET_ENCRYPTION_KEY</code> (today, rotating the key requires re-encrypting every existing ciphertext by hand).</li>
        <li>Customer-managed key option for the hosted demo (you bring your own KMS).</li>
      </ul>
      <p>
        None of these are blockers for letting the kind of content BBC is designed for (voice rules, ADRs, vendor handles, glossary, team facts) live in the hosted demo. They are blockers for the kind of content that should live in a vault.
      </p>

      <h2>Reporting a vulnerability</h2>
      <p>
        See <a href="https://github.com/ocWWp/bbc/blob/main/SECURITY.md">SECURITY.md</a> in the repo for the disclosure process (90-day window, GitHub Security Advisories, credit policy). Email <a href="mailto:security@bbc.tools">security@bbc.tools</a> for first contact.
      </p>

      <h2>Honest summary</h2>
      <p>
        BBC v1 is a single-tenant-per-row, RLS-isolated, BYOK-encrypted, invite-only Postgres app running on Cloudflare. It is not a vault. The trust model is <em>trust the operator</em>; the escape hatch is <em>self-host the AGPLv3 code</em>. If you can live with that, the hosted demo is safe enough for the strategy-doc-tier content the product is built for. If you can&apos;t, the entire stack is one <code>git clone</code> away.
      </p>
    </article>
  );
}
