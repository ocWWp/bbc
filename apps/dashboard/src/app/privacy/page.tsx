import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — BBC",
};

export default function PrivacyPage() {
  return (
    <article className="prose prose-neutral dark:prose-invert mx-auto max-w-3xl py-12">
      <h1>Privacy Policy</h1>
      <p className="text-sm text-muted-foreground">Last updated: 2026-05-13</p>

      <p>
        BBC is AGPLv3 open source. You can self-host the entire stack, or use the hosted demo at <a href="https://bbc.tools">bbc.tools</a>. This policy describes what the hosted demo collects; self-hosted instances are governed entirely by you.
      </p>

      <h2>What the hosted demo collects</h2>
      <ul>
        <li><strong>Account:</strong> email, OAuth provider identifier (GitHub/Google), display name.</li>
        <li><strong>Tenant content:</strong> memory items (decisions, voice, vendors, glossary, team, product, skills, source artifacts, notes), queue proposals, and audit logs you create. You own this content.</li>
        <li><strong>Connector content:</strong> when you install a connector (Notion, Linear, GitHub, Gmail, Drive, generic webhook), BBC reads the data you grant access to and stores the resulting typed memory in your tenant&apos;s Postgres rows.</li>
        <li><strong>OAuth tokens:</strong> for installed connectors, encrypted at rest with AES-256-GCM in your tenant&apos;s <code>external_accounts</code> row.</li>
        <li><strong>Telemetry:</strong> request logs and error traces from the host infrastructure. No third-party product analytics in the demo.</li>
        <li><strong>Cookies:</strong> a session cookie required for sign-in. No tracking cookies.</li>
      </ul>

      <h2>What we don&apos;t do</h2>
      <ul>
        <li>We <strong>do not</strong> train AI models on your tenant content. The hosted demo proxies inference to the LLM provider you configure; per their policies, content sent for inference is not used to train their models.</li>
        <li>We <strong>do not</strong> sell or share your tenant content with other tenants. Row-level security in Postgres enforces this at the database layer; every query is scoped by <code>is_member_of(tenant_id)</code>.</li>
        <li>We <strong>do not</strong> run any non-essential cookies or third-party analytics scripts on the hosted demo.</li>
      </ul>

      <h2>Third parties used by the hosted demo</h2>
      <p>If you self-host, replace each of these with your own choice via the vendor registry at <code>memory/ops/vendors.md</code>.</p>
      <ul>
        <li><strong>Cloudflare</strong> — Workers + R2 for compute and static asset hosting.</li>
        <li><strong>Supabase</strong> — Postgres + Auth + row-level security. Single-region; EU residency available for self-hosters who deploy to an EU Supabase project.</li>
        <li><strong>Anthropic</strong> — default LLM provider for studio runs. Replaceable per tenant under <code>/settings/keys</code> (BYOK).</li>
        <li><strong>Resend</strong> — transactional email (invitations).</li>
      </ul>
      <p>
        BBC runs no payment processor, no Stripe, no metering pipeline. The hosted demo is free under a daily request cap; v1 has no SaaS billing per <a href="https://github.com/ocWWp/bbc/blob/main/memory/decisions/0007-oss-first-agpl-deferred-commercialization.md">ADR-0007</a>. If you exceed the demo cap, self-host or wire your own API key under <code>/settings/keys</code>.
      </p>
      <p>
        When you install a connector (Notion, Linear, GitHub, Gmail, Drive), data flows directly between BBC and that provider over OAuth scopes you explicitly grant. Each provider&apos;s own privacy policy applies to the data they hold.
      </p>

      <h2>Your rights</h2>
      <p>
        You can export, edit, or delete your tenant data at any time from Settings. The dashboard is multi-tenant via Postgres RLS, so deleting a tenant cascades to every row tied to it. EU/UK users have additional rights under GDPR — contact <a href="mailto:privacy@bbc.tools">privacy@bbc.tools</a>.
      </p>

      <h2>Data retention</h2>
      <p>
        Active tenant data: retained while your account is active. Deleted accounts: 30-day grace period, then permanent deletion via Postgres cascade. Self-hosters control retention entirely.
      </p>

      <h2>Changes</h2>
      <p>Material changes to this policy are committed in <a href="https://github.com/ocWWp/bbc">the public BBC repo</a> and emailed to demo-tenant admins at least 30 days in advance.</p>

      <h2>Contact</h2>
      <p>Privacy questions: <a href="mailto:privacy@bbc.tools">privacy@bbc.tools</a></p>
    </article>
  );
}
