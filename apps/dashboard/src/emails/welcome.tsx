import { Link, Text } from "@react-email/components";
import { EmailShell, styles } from "./_components";

interface WelcomeEmailProps {
  founderName?: string;
  dashboardUrl: string;
}

export function WelcomeEmail({ founderName, dashboardUrl }: WelcomeEmailProps) {
  return (
    <EmailShell preview="Welcome to BBC — let's build your brain">
      <Text style={styles.h1}>Welcome to BBC{founderName ? `, ${founderName}` : ""}.</Text>
      <Text style={styles.text}>
        You just signed up for BBC — the shared brain for your team and your AI agents.
      </Text>
      <Text style={styles.text}>
        Your next step is the brain dump. Tell BBC about your company in 5 minutes, and it&apos;ll structure
        your voice, decisions, vendors, and glossary into a queryable knowledge layer your AI agents can read from.
      </Text>
      <Link href={dashboardUrl} style={styles.cta}>Start the brain dump →</Link>
      <Text style={{ ...styles.text, marginTop: 24 }}>
        Questions? Just reply to this email.
      </Text>
    </EmailShell>
  );
}

export default WelcomeEmail;
