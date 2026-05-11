import { Link, Text } from "@react-email/components";
import { EmailShell, styles } from "./_components";

interface PaywallEmailProps {
  founderName?: string;
  reason: "credits_exhausted" | "brain_items_limit" | "mcp_write_needed" | "invite_needed";
  upgradeUrl: string;
}

const REASON_COPY: Record<PaywallEmailProps["reason"], { h1: string; body: string; cta: string }> = {
  credits_exhausted: {
    h1: "You're out of credits this month.",
    body: "Your AI agents ran out of credits. Upgrade to Solo Founder ($29/mo) for 3,500 credits, or wait until your free tier resets.",
    cta: "Upgrade to Solo Founder",
  },
  brain_items_limit: {
    h1: "Your brain is filling up.",
    body: "You've reached the 500-item limit on the Free plan. Upgrade to Solo Founder to capture decisions, vendors, and voice rules without a cap.",
    cta: "Upgrade for unlimited brain",
  },
  mcp_write_needed: {
    h1: "MCP write is on Solo Founder.",
    body: "You're trying to wire your AI agents to write back to BBC through MCP. That's on Solo Founder ($29/mo) and above.",
    cta: "Upgrade for MCP write",
  },
  invite_needed: {
    h1: "Inviting teammates needs Startup.",
    body: "Bring teammates into your tenant on the Startup plan ($129/mo) — up to 10 seats, full role-based permissions.",
    cta: "See Startup features",
  },
};

export function PaywallEmail({ founderName, reason, upgradeUrl }: PaywallEmailProps) {
  const copy = REASON_COPY[reason];
  return (
    <EmailShell preview={copy.h1}>
      <Text style={styles.h1}>{copy.h1}</Text>
      {founderName && <Text style={styles.text}>Hey {founderName},</Text>}
      <Text style={styles.text}>{copy.body}</Text>
      <Link href={upgradeUrl} style={styles.cta}>{copy.cta} →</Link>
      <Text style={{ ...styles.text, marginTop: 24, fontSize: 12, color: "#6b6b6f" }}>
        Compare all plans at <Link href="https://bbc.tools/pricing" style={{ color: "#6b6b6f" }}>bbc.tools/pricing</Link>.
      </Text>
    </EmailShell>
  );
}

export default PaywallEmail;
