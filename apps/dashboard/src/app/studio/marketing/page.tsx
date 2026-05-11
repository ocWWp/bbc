import { redirect } from "next/navigation";
import { requireActor } from "@/lib/auth/require-user";
import "@/lib/studio/templates"; // side-effect registration
import { listClientTemplates } from "@/lib/studio/templates/registry";

import StudioClient from "./StudioClient";

export const metadata = {
  title: "Marketing Studio · BBC",
};

export default async function MarketingStudioPage() {
  const a = await requireActor();
  if (!a.ok) {
    redirect(`/auth/sign-in?next=${encodeURIComponent("/studio/marketing")}`);
  }

  const templates = listClientTemplates();
  const authorHint = {
    name: a.actor.identifier,
    handle: a.actor.identifier.replace(/[^a-z0-9]+/gi, "").toLowerCase().slice(0, 16),
  };

  return (
    <main className="mx-auto max-w-5xl px-4 sm:px-6 py-8 sm:py-12">
      <header className="mb-8 sm:mb-12">
        <div className="text-[11px] font-semibold tracking-[0.18em] uppercase text-muted-foreground">
          Marketing Studio
        </div>
        <h1 className="mt-2 text-3xl sm:text-4xl font-bold tracking-tight">
          What do you want to make?
        </h1>
        <p className="mt-2 text-muted-foreground text-base sm:text-lg max-w-2xl">
          Describe a marketing task. The Studio picks workflows that fit your
          brain, generates content in your voice, and cites the memories that
          shaped it.
        </p>
      </header>

      <StudioClient templates={templates} authorHint={authorHint} />
    </main>
  );
}
