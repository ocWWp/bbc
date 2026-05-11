import { Link, Text } from "@react-email/components";
import { EmailShell, styles } from "./_components";

interface InviteEmailProps {
  inviterName: string;
  tenantName: string;
  role: string;
  acceptUrl: string;
}

export function InviteEmail({ inviterName, tenantName, role, acceptUrl }: InviteEmailProps) {
  return (
    <EmailShell preview={`${inviterName} invited you to ${tenantName} on BBC`}>
      <Text style={styles.h1}>You&apos;re invited.</Text>
      <Text style={styles.text}>
        <strong>{inviterName}</strong> invited you to <strong>{tenantName}</strong> on BBC as <strong>{role}</strong>.
      </Text>
      <Text style={styles.text}>
        BBC is the shared brain your team and AI agents read from. Click below to accept and sign in.
      </Text>
      <Link href={acceptUrl} style={styles.cta}>Accept invite →</Link>
      <Text style={{ ...styles.text, marginTop: 24, fontSize: 12, color: "#6b6b6f" }}>
        This invite expires in 7 days. If you weren&apos;t expecting this, you can ignore the email.
      </Text>
    </EmailShell>
  );
}

export default InviteEmail;
