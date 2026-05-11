import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — BBC",
};

export default function PrivacyPage() {
  return (
    <article className="prose prose-neutral dark:prose-invert mx-auto max-w-3xl py-12">
      <h1>Privacy Policy</h1>
      <p className="text-sm text-muted-foreground">Last updated: 2026-05-10</p>

      <h2>What we collect</h2>
      <ul>
        <li><strong>Account:</strong> email, name, company name, role.</li>
        <li><strong>Tenant content:</strong> memory items, queue proposals, audit logs, drafts — owned by you.</li>
        <li><strong>Usage:</strong> page views, feature interactions, agent run telemetry (via PostHog).</li>
        <li><strong>Errors:</strong> exception traces (via Sentry), anonymized where possible.</li>
        <li><strong>Cookies:</strong> session cookie (required for login). Optional analytics cookie if you accept the banner.</li>
      </ul>

      <h2>What we don&apos;t do</h2>
      <ul>
        <li>We <strong>do not</strong> train AI models on your tenant content.</li>
        <li>We <strong>do not</strong> sell your data.</li>
        <li>We <strong>do not</strong> share your tenant content with other tenants.</li>
      </ul>

      <h2>Third parties we use</h2>
      <ul>
        <li><strong>Supabase</strong> — auth + Postgres database + RLS isolation.</li>
        <li><strong>Anthropic / OpenAI</strong> — LLM inference for agent runs. Per their policies, content sent for inference is not used to train.</li>
        <li><strong>Resend</strong> — transactional email (invitations, digests).</li>
        <li><strong>Stripe</strong> — payment processing.</li>
        <li><strong>PostHog</strong> — product analytics (self-hosted EU instance).</li>
        <li><strong>Sentry</strong> — error monitoring.</li>
        <li><strong>Vercel</strong> — hosting.</li>
      </ul>
      <p>When you connect third-party tools (Higgsfield, n8n, etc.), data flows directly between BBC and those providers per their own policies.</p>

      <h2>Your rights</h2>
      <p>You can export, edit, or delete your tenant data at any time from Settings. EU/UK users have additional rights under GDPR — contact <a href="mailto:privacy@bbc.tools">privacy@bbc.tools</a>.</p>

      <h2>Data retention</h2>
      <p>Active tenant data: retained while your account is active. Deleted accounts: 30-day grace period, then permanent deletion. Audit logs follow your plan&apos;s retention (30 days / 1 year / forever).</p>

      <h2>Changes</h2>
      <p>Material changes notified by email at least 30 days in advance.</p>

      <h2>Contact</h2>
      <p>Privacy questions: <a href="mailto:privacy@bbc.tools">privacy@bbc.tools</a></p>
    </article>
  );
}
