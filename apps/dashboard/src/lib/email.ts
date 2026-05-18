import "server-only";
import { Resend } from "resend";

/**
 * Email send via Resend. Falls back to console.log when RESEND_API_KEY is
 * unset (dev-friendly — local invitation flows still surface the URL the
 * recipient would click, just without an actual email going out).
 *
 * Required env vars to actually send:
 *   RESEND_API_KEY=re_…
 *   RESEND_FROM=BBC <onboarding@your-domain.com>   (must be a verified domain in Resend)
 */

export type SendArgs = {
  to: string;
  subject: string;
  html: string;
  text?: string;
};

export async function sendEmail(args: SendArgs): Promise<{ ok: boolean; output: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM;

  if (!apiKey || !from) {
    // Dev-mode fallback: log the would-be email so the operator can see what
    // was supposed to send. Useful when Resend isn't wired up locally.
    // eslint-disable-next-line no-console
    console.log(
      `[email:dev-mode] Would have sent:\n  to:      ${args.to}\n  subject: ${args.subject}\n  body (text): ${args.text ?? "(html only)"}\n  RESEND_API_KEY/RESEND_FROM not set — set both to enable real sending.`,
    );
    return {
      ok: true,
      output: "RESEND not configured — email logged to server console only",
    };
  }

  try {
    const resend = new Resend(apiKey);
    const result = await resend.emails.send({
      from,
      to: args.to,
      subject: args.subject,
      html: args.html,
      text: args.text,
    });
    if (result.error) {
      return { ok: false, output: `Resend error: ${result.error.message}` };
    }
    return { ok: true, output: `Sent to ${args.to} (id: ${result.data?.id})` };
  } catch (e: unknown) {
    return { ok: false, output: `Resend exception: ${(e as Error).message}` };
  }
}

// ---------- Templates ----------

export type InvitationEmailArgs = {
  to: string;
  tenantName: string;
  tenantSlug: string;
  /** Either a base role ("admin"/"member"/"viewer") or a role template display name ("Founder"/"Engineering"/etc.). */
  role: string;
  invitedByLabel: string;
  /** Where the invitee lands: /invite/<token> if a token exists, else /auth/signin?email=…. */
  acceptUrl: string;
};

export function invitationEmailHtml(a: InvitationEmailArgs): string {
  const safe = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<!doctype html>
<html><body style="font-family:system-ui,sans-serif;color:#222;max-width:560px;margin:0 auto;padding:24px;">
  <h2 style="margin-top:0;">You've been invited to <strong>${safe(a.tenantName)}</strong> on BBC</h2>
  <p><strong>${safe(a.invitedByLabel)}</strong> invited you to join the <code>${safe(a.tenantSlug)}</code> tenant as <strong>${a.role}</strong>.</p>
  <p>BBC is the company brain — markdown decisions + a proposal queue + a dashboard your whole team (and your agents) read from.</p>
  <p style="margin:24px 0;">
    <a href="${safe(a.acceptUrl)}"
       style="background:#0a7;color:#fff;text-decoration:none;padding:10px 18px;border-radius:4px;font-weight:600;">
      Accept invitation
    </a>
  </p>
  <p style="font-size:13px;color:#666;">
    Or paste this URL into your browser:<br/>
    <code style="word-break:break-all;">${safe(a.acceptUrl)}</code>
  </p>
  <hr style="border:none;border-top:1px solid #eee;margin:32px 0 16px;"/>
  <p style="font-size:12px;color:#888;">
    Don't recognize this invitation? You can safely ignore this email — no account is created until you click the link.
    <br/>BBC · github.com/ocWWp/bbc
  </p>
</body></html>`;
}

export function invitationEmailText(a: InvitationEmailArgs): string {
  return [
    `You've been invited to ${a.tenantName} on BBC.`,
    "",
    `${a.invitedByLabel} invited you to join the "${a.tenantSlug}" tenant as ${a.role}.`,
    "",
    `Accept the invitation:`,
    a.acceptUrl,
    "",
    `BBC is the company brain — markdown decisions + a proposal queue + a dashboard your whole team (and your agents) read from.`,
    "",
    `Don't recognize this invitation? You can safely ignore this email — no account is created until you click the link.`,
    "",
    `BBC · github.com/ocWWp/bbc`,
  ].join("\n");
}

// ---------- React Email template senders (Phase G) ----------

import { render } from "@react-email/render";
import { WelcomeEmail } from "@/emails/welcome";
import { InviteEmail } from "@/emails/invite";
import { QueueDigestEmail } from "@/emails/queue-digest";
import { PaywallEmail } from "@/emails/paywall";
import { ContinueOnboardingEmail } from "@/emails/continue-onboarding";

const FROM = process.env.RESEND_FROM_EMAIL || process.env.RESEND_FROM || "BBC <hello@bbc.tools>";

function getResend() {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  return new Resend(key);
}

export async function sendWelcome(to: string, founderName: string | undefined, dashboardUrl: string) {
  const resend = getResend();
  if (!resend) {
    console.warn("[email] RESEND_API_KEY missing — skipping welcome to", to);
    return { skipped: true };
  }
  const html = await render(WelcomeEmail({ founderName, dashboardUrl }));
  return resend.emails.send({ from: FROM, to, subject: "Welcome to BBC", html });
}

export async function sendInvite(to: string, inviterName: string, tenantName: string, role: string, acceptUrl: string) {
  const resend = getResend();
  if (!resend) {
    console.warn("[email] RESEND_API_KEY missing — skipping invite to", to);
    return { skipped: true };
  }
  const html = await render(InviteEmail({ inviterName, tenantName, role, acceptUrl }));
  return resend.emails.send({ from: FROM, to, subject: `${inviterName} invited you to ${tenantName}`, html });
}

export async function sendQueueDigest(
  to: string,
  founderName: string | undefined,
  pendingCount: number,
  topItems: Array<{ title: string; type: string }>,
  dashboardUrl: string,
) {
  const resend = getResend();
  if (!resend) {
    console.warn("[email] RESEND_API_KEY missing — skipping digest to", to);
    return { skipped: true };
  }
  const html = await render(QueueDigestEmail({ founderName, pendingCount, topItems, dashboardUrl }));
  const subject = `${pendingCount} ${pendingCount === 1 ? "proposal" : "proposals"} waiting in BBC`;
  return resend.emails.send({ from: FROM, to, subject, html });
}

export async function sendPaywall(
  to: string,
  founderName: string | undefined,
  reason: "credits_exhausted" | "brain_items_limit" | "mcp_write_needed" | "invite_needed",
  upgradeUrl: string,
) {
  const resend = getResend();
  if (!resend) {
    console.warn("[email] RESEND_API_KEY missing — skipping paywall to", to);
    return { skipped: true };
  }
  const html = await render(PaywallEmail({ founderName, reason, upgradeUrl }));
  const SUBJECTS = {
    credits_exhausted: "You're out of credits this month",
    brain_items_limit: "Your brain is filling up",
    mcp_write_needed: "MCP write is on Solo Founder",
    invite_needed: "Inviting teammates needs Startup",
  };
  return resend.emails.send({ from: FROM, to, subject: SUBJECTS[reason], html });
}

export async function sendContinueOnboarding(to: string, tenantSlug: string, resumeUrl: string) {
  const resend = getResend();
  if (!resend) {
    console.warn("[email] RESEND_API_KEY missing — skipping continue-onboarding to", to);
    return { skipped: true };
  }
  const html = await render(ContinueOnboardingEmail({ tenantSlug, resumeUrl }));
  return resend.emails.send({
    from: FROM,
    to,
    subject: "Your brain is waiting",
    html,
  });
}
