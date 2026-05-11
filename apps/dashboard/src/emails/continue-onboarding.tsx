import { Button, Text } from "@react-email/components";
import * as React from "react";
import { EmailShell } from "./_components";

type Props = {
  tenantSlug: string;
  resumeUrl: string;
};

export function ContinueOnboardingEmail({ tenantSlug, resumeUrl }: Props) {
  return (
    <EmailShell preview="Your brain is waiting — finish onboarding in 30 seconds.">
      <Text style={{ fontSize: 22, fontWeight: 600, margin: "0 0 8px", color: "#0a0a0b" }}>
        Your brain is waiting.
      </Text>
      <Text style={{ fontSize: 14, lineHeight: 1.6, color: "#0a0a0b" }}>
        You started setting up <code>{tenantSlug}</code> on BBC but didn't finish.
        Paste a paragraph about your product and we'll structure it into typed memory
        items — voice, decisions, team, vendors — that every agent on your stack can read.
      </Text>
      <Text style={{ fontSize: 14, lineHeight: 1.6, color: "#0a0a0b", marginTop: 8 }}>
        It takes 30 seconds. Pick up where you left off:
      </Text>
      <Button
        href={resumeUrl}
        style={{
          backgroundColor: "#0a0a0b",
          color: "#ffffff",
          padding: "10px 18px",
          borderRadius: 8,
          fontSize: 14,
          fontWeight: 500,
          textDecoration: "none",
          marginTop: 12,
        }}
      >
        Continue onboarding →
      </Button>
    </EmailShell>
  );
}

ContinueOnboardingEmail.PreviewProps = {
  tenantSlug: "acme",
  resumeUrl: "https://bbc.tools/welcome",
} as Props;

export default ContinueOnboardingEmail;
