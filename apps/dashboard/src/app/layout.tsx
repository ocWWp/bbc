import type { Metadata } from "next";
import { ThemeProvider } from "@/components/theme-provider";
import { PostHogProvider } from "@/components/posthog-provider";
import { Toaster } from "@/components/ui/sonner";
import { CommandPalette } from "@/components/command-palette";
import { CookieBanner } from "@/components/cookie-banner";
import Nav from "@/components/Nav";
import "@blocknote/mantine/style.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "BBC — Big Brain Company",
  description: "The shared brain for your team and your AI agents.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <PostHogProvider>
            <div className="mx-auto max-w-7xl p-6">
              <Nav />
              <main>{children}</main>
            </div>
            <Toaster />
            <CommandPalette />
            <CookieBanner />
          </PostHogProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
