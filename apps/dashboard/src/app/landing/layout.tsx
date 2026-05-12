import type { Metadata } from "next";
import "./styles.css";

// Fonts (Geist, Geist Mono, Instrument Serif, Inter Tight) are loaded at the
// root layout so every dashboard page can use the paper-palette type system.
// This layout only wraps the landing tree so landing-specific selectors that
// key off `.bbc-landing-root` keep working.

export const metadata: Metadata = {
  title: "BBC — typed memory for humans and agents",
  description:
    "Open-source structured company brain. Brain-dumps go in; typed memory comes out; agents query it deterministically; over time, BBC files improvement proposals about your company itself.",
};

export default function LandingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bbc-landing-root" data-theme="light">
      {children}
    </div>
  );
}
