import { Body, Container, Head, Hr, Html, Link, Preview, Text } from "@react-email/components";
import * as React from "react";

const styles = {
  body: { backgroundColor: "#f6f6f7", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" },
  container: { backgroundColor: "#ffffff", margin: "40px auto", padding: "32px", maxWidth: "560px", borderRadius: "12px", border: "1px solid #e7e7e9" },
  brand: { fontSize: "14px", fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase" as const, color: "#444", marginBottom: "16px" },
  h1: { fontSize: "22px", fontWeight: 600, margin: "0 0 8px", color: "#0a0a0b" },
  text: { fontSize: "14px", lineHeight: 1.6, color: "#0a0a0b" },
  cta: { backgroundColor: "#0a0a0b", color: "#ffffff", padding: "10px 18px", borderRadius: "8px", fontSize: "14px", fontWeight: 500, textDecoration: "none", display: "inline-block" },
  footer: { fontSize: "12px", color: "#6b6b6f", marginTop: "32px" },
};

export function EmailShell({ preview, children }: { preview: string; children: React.ReactNode }) {
  return (
    <Html>
      <Head />
      <Preview>{preview}</Preview>
      <Body style={styles.body}>
        <Container style={styles.container}>
          <Text style={styles.brand}>BBC · Big Brain Company</Text>
          {children}
          <Hr style={{ borderColor: "#e7e7e9", margin: "24px 0" }} />
          <Text style={styles.footer}>
            BBC, bbc.tools · <Link href="https://bbc.tools/privacy" style={{ color: "#6b6b6f" }}>Privacy</Link> · <Link href="https://bbc.tools/terms" style={{ color: "#6b6b6f" }}>Terms</Link>
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export { styles };
