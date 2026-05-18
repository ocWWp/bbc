import { Nav } from "./_components/Nav";
import { Hero } from "./_components/Hero";
import { Walkthrough } from "./_components/Walkthrough";
import { Roadmap } from "./_components/Roadmap";
import { WhyBBC } from "./_components/WhyBBC";
import { VsVector } from "./_components/VsVector";
import { CodeBlock } from "./_components/CodeBlock";
import { Stack } from "./_components/Stack";
import { CTA } from "./_components/CTA";
import { Footer } from "./_components/Footer";

export default function LandingPage() {
  return (
    <>
      <Nav />
      <main>
        <Hero />
        <Walkthrough />
        <Roadmap />
        <WhyBBC />
        <VsVector />
        <CodeBlock />
        <Stack />
        <CTA />
      </main>
      <Footer />
    </>
  );
}
