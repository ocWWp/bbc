import type { Metadata } from "next";
import Nav from "@/components/Nav";
import "./globals.css";

export const metadata: Metadata = {
  title: "BBC Dashboard",
  description: "PM tab for the BBC — Brain Cortex",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="shell">
          <Nav />
          <main>{children}</main>
          <footer style={{ marginTop: 64, paddingTop: 16, borderTop: "1px solid var(--line)", color: "var(--muted)", fontSize: 11 }}>
            BBC dashboard · single-user dev only · shell-exec from web server is intentional and unsafe in any other context.
          </footer>
        </div>
      </body>
    </html>
  );
}
