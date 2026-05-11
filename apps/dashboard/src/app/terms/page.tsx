import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service — BBC",
};

export default function TermsPage() {
  return (
    <article className="prose prose-neutral dark:prose-invert mx-auto max-w-3xl py-12">
      <h1>Terms of Service</h1>
      <p className="text-sm text-muted-foreground">Last updated: 2026-05-10</p>

      <p>By using BBC (Big Brain Company), you agree to these terms. If you don&apos;t agree, don&apos;t use the service.</p>

      <h2>1. Your account</h2>
      <p>You are responsible for your account credentials and any activity under your account. Notify us immediately if you suspect unauthorized access.</p>

      <h2>2. Your content and data</h2>
      <p>You own your tenant&apos;s content — decisions, voice rules, vendor records, glossary terms, audit logs. We do not train models on your content. You can export or delete your tenant data at any time from Settings.</p>

      <h2>3. AI agent outputs</h2>
      <p>BBC&apos;s agents produce drafts you approve through the queue. You are responsible for content you publish or share, including drafts you accept from agents. We don&apos;t guarantee agent outputs are accurate, lawful, or fit for any specific purpose.</p>

      <h2>4. Acceptable use</h2>
      <p>Don&apos;t use BBC to violate laws, infringe rights, harm others, or run abusive AI workloads. We may suspend accounts that violate this section.</p>

      <h2>5. Subscriptions and credits</h2>
      <p>Paid plans renew automatically until canceled. Credits reset monthly and don&apos;t roll over. Refunds for unused credits are not offered except where required by law.</p>

      <h2>6. Third-party tools</h2>
      <p>BBC integrates with third-party providers (e.g., LLM, image generation, automation). You may use BBC&apos;s account (charged as credits) or bring your own keys. We are not responsible for third-party outages, pricing changes, or data practices.</p>

      <h2>7. Termination</h2>
      <p>Either party may terminate at any time. After termination, we retain your tenant data for 30 days before permanent deletion.</p>

      <h2>8. Liability</h2>
      <p>BBC is provided &quot;as is&quot; without warranties. Our liability is capped at fees paid in the prior 12 months.</p>

      <h2>9. Changes</h2>
      <p>We may update these terms. Material changes will be notified by email at least 30 days in advance.</p>

      <h2>10. Contact</h2>
      <p>Questions: <a href="mailto:hello@bbc.tools">hello@bbc.tools</a></p>
    </article>
  );
}
