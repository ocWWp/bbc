import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service — BBC",
};

export default function TermsPage() {
  return (
    <article className="prose prose-neutral dark:prose-invert mx-auto max-w-3xl py-12">
      <h1>Terms of Service</h1>
      <p className="text-sm text-muted-foreground">Last updated: 2026-05-13</p>

      <p>
        BBC (Big Brain Company) is AGPLv3 open-source software. These terms govern your use of the hosted demo at <a href="https://bbc.tools">bbc.tools</a>. If you self-host BBC, the AGPLv3 license alone applies; these terms do not.
      </p>

      <h2>1. Your account</h2>
      <p>You are responsible for your account credentials and any activity under your account. Notify us immediately if you suspect unauthorized access by emailing <a href="mailto:hello@bbc.tools">hello@bbc.tools</a>.</p>

      <h2>2. Your content and data</h2>
      <p>
        You own your tenant&apos;s content — every memory item, queue proposal, connector configuration, and audit log. We do not train models on your content. You can export or delete your tenant data at any time from Settings.
      </p>

      <h2>3. AI agent outputs</h2>
      <p>
        BBC&apos;s studios produce drafts you approve through the queue. You are responsible for content you publish or share, including drafts you accept from a studio. We make no guarantee that studio outputs are accurate, lawful, or fit for any specific purpose; review every output before acting on it.
      </p>

      <h2>4. Acceptable use</h2>
      <p>
        Don&apos;t use BBC to violate laws, infringe rights, harm others, run abusive AI workloads, or attempt to evade the demo&apos;s per-tenant request caps. We may suspend or remove accounts that violate this section.
      </p>

      <h2>5. Pricing and BYOK</h2>
      <p>
        The hosted demo is free under a daily request cap. There is no SaaS billing, no credits, no metering, and no paid plans in v1 — see <a href="https://github.com/ocWWp/bbc/blob/main/memory/decisions/0007-bbc-license.md">ADR-0007</a> for the rationale. If you need more than the demo provides, either self-host (recommended) or wire your own LLM API key in <code>/settings/keys</code> (BYOK). Inference cost when you BYOK is paid by you, directly to the provider.
      </p>

      <h2>6. Third-party providers and connectors</h2>
      <p>
        When you install a connector (Notion, Linear, GitHub, Gmail, Drive, generic webhook) BBC reads the data you grant access to over OAuth scopes you confirm at install time. Each provider&apos;s own terms and privacy policy apply to the data they hold. BBC is not responsible for third-party outages, pricing changes, or data practices.
      </p>

      <h2>7. Termination</h2>
      <p>
        Either party may terminate at any time. After termination, we retain your tenant data for 30 days as a grace period, then permanently delete it via Postgres cascade.
      </p>

      <h2>8. Open-source license + warranty</h2>
      <p>
        BBC source is licensed under AGPLv3; see <code>LICENSE</code> in the public <a href="https://github.com/ocWWp/bbc">BBC repo</a>. The hosted demo is provided &quot;as is&quot; without warranties of any kind. Our liability for the hosted demo is capped at any fees you have paid in the prior 12 months (which, in v1, is zero).
      </p>

      <h2>9. Changes</h2>
      <p>
        We may update these terms. Material changes are committed in the public repo and emailed to demo-tenant admins at least 30 days in advance.
      </p>

      <h2>10. Contact</h2>
      <p>Questions: <a href="mailto:hello@bbc.tools">hello@bbc.tools</a></p>
    </article>
  );
}
