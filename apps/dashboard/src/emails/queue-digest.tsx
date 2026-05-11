import { Link, Text } from "@react-email/components";
import { EmailShell, styles } from "./_components";

interface QueueDigestEmailProps {
  founderName?: string;
  pendingCount: number;
  topItems: Array<{ title: string; type: string }>;
  dashboardUrl: string;
}

export function QueueDigestEmail({ founderName, pendingCount, topItems, dashboardUrl }: QueueDigestEmailProps) {
  return (
    <EmailShell preview={`${pendingCount} proposals waiting for your review`}>
      <Text style={styles.h1}>
        {pendingCount} {pendingCount === 1 ? "proposal" : "proposals"} waiting{founderName ? `, ${founderName}` : ""}.
      </Text>
      <Text style={styles.text}>
        Your AI agents drafted these for you. Open BBC to review and approve.
      </Text>
      <ul style={{ paddingLeft: 16, margin: "16px 0" }}>
        {topItems.slice(0, 5).map((item, i) => (
          <li key={i} style={{ ...styles.text, marginBottom: 4 }}>
            <strong>{item.type}:</strong> {item.title}
          </li>
        ))}
      </ul>
      <Link href={dashboardUrl} style={styles.cta}>Open queue →</Link>
    </EmailShell>
  );
}

export default QueueDigestEmail;
