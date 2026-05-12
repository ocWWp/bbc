import type { Metadata } from "next";
import { Geist, Geist_Mono, Instrument_Serif, Inter_Tight } from "next/font/google";
import "./styles.css";

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
  title: "BBC — typed memory for humans and agents",
  description:
    "Open-source structured company brain. Brain-dumps go in; typed memory comes out; agents query it deterministically; over time, BBC files improvement proposals about your company itself.",
};

export default function LandingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className={`bbc-landing-root ${geist.variable} ${geistMono.variable} ${instrumentSerif.variable} ${interTight.variable}`}
      data-theme="light"
    >
      {children}
    </div>
  );
}
