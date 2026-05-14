import type { Metadata } from "next";
import { Geist, Geist_Mono, Instrument_Serif, Inter_Tight } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import { PostHogProvider } from "@/components/posthog-provider";
import { Toaster } from "@/components/ui/sonner";
import { CommandPalette } from "@/components/command-palette";
import { CookieBanner } from "@/components/cookie-banner";
import { AppShell } from "@/components/AppShell";
import Nav from "@/components/Nav";
import "@blocknote/mantine/style.css";
import "./globals.css";

// Fonts that make up the BBC paper-palette design language. Lifted to the
// root layout so every page (not just /landing) has access. Landing's
// previous per-route load is removed; the variables resolve the same.
const geist = Geist({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800", "900"],
  variable: "--font-geist",
  display: "swap",
});
const geistMono = Geist_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-geist-mono",
  display: "swap",
});
const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: ["400"],
  style: ["normal", "italic"],
  variable: "--font-instrument-serif",
  display: "swap",
});
const interTight = Inter_Tight({
  subsets: ["latin"],
  weight: ["600", "700", "800", "900"],
  variable: "--font-inter-tight",
  display: "swap",
});

export const metadata: Metadata = {
  title: "BBC — Big Brain Company",
  description: "The shared brain for your team and your AI agents.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geist.variable} ${geistMono.variable} ${instrumentSerif.variable} ${interTight.variable}`}
    >
      <body>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <PostHogProvider>
            <AppShell nav={<Nav />}>{children}</AppShell>
            <Toaster />
            <CommandPalette />
            <CookieBanner />
          </PostHogProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
