import Link from "next/link";
import { readBindings } from "@/lib/read-bindings";
import { readProviders, type ProviderAdapter } from "@/lib/read-providers";

export const dynamic = "force-dynamic";
export const metadata = { title: "Marketplace · BBC" };

const ROLE_LABELS: Record<string, string> = {
  "llm-provider": "AI models",
  "db-provider": "Databases",
  "email-delivery": "Email",
  "web-host": "Hosting",
  analytics: "Analytics",
  "api-host": "API hosting",
  "design-source": "Design sources",
  "video-gen": "Video generation",
};

export default async function MarketplacePage() {
  const [providers, bindings] = await Promise.all([readProviders(), readBindings()]);

  // Bucket providers by their first declared role.
  const grouped = new Map<string, ProviderAdapter[]>();
  for (const p of providers) {
    const role = p.implements[0] ?? "other";
    if (!grouped.has(role)) grouped.set(role, []);
    grouped.get(role)!.push(p);
  }

  const boundByRole = new Map(bindings.map((b) => [b.role, b]));

  const allRoles = [...grouped.keys()].sort((a, b) => {
    const order = ["llm-provider", "db-provider", "email-delivery", "web-host", "analytics"];
    const ai = order.indexOf(a);
    const bi = order.indexOf(b);
    if (ai === -1 && bi === -1) return a.localeCompare(b);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });

  return (
    <main className="mx-auto max-w-5xl px-4 sm:px-6 py-8 sm:py-12">
      <header className="mb-8">
        <div className="text-[11px] font-semibold tracking-[0.18em] uppercase text-muted-foreground">
          Marketplace
        </div>
        <h1 className="mt-2 text-3xl sm:text-4xl font-bold tracking-tight">
          Provider directory
        </h1>
        <p className="mt-2 text-muted-foreground max-w-2xl">
          Every adapter that satisfies a BBC role contract. Bindings declare
          which adapter is active for each role; change a binding via the{" "}
          <Link href="/queue" className="underline">
            proposal queue
          </Link>
          . API keys for providers you use are stored at{" "}
          <Link href="/settings/keys" className="underline">
            Settings → API keys
          </Link>
          .
        </p>
      </header>

      {providers.length === 0 ? (
        <div className="rounded-2xl border bg-card p-6 text-sm text-muted-foreground">
          No providers declared in <code>memory/ops/providers/</code> for this tenant.
        </div>
      ) : (
        <div className="space-y-10">
          {allRoles.map((role) => (
            <section key={role}>
              <div className="flex items-baseline justify-between mb-3">
                <h2 className="text-xs font-semibold tracking-[0.16em] uppercase text-muted-foreground">
                  {ROLE_LABELS[role] ?? role}
                </h2>
                {boundByRole.has(role) ? (
                  <span className="text-[11px] text-muted-foreground">
                    Active:{" "}
                    <code className="text-foreground">
                      {boundByRole.get(role)!.provider}
                    </code>
                  </span>
                ) : (
                  <span className="text-[11px] text-muted-foreground">No active binding</span>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                {grouped.get(role)!.map((p) => (
                  <ProviderCard
                    key={p.id}
                    provider={p}
                    isActive={boundByRole.get(role)?.provider === p.providerId}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}

function ProviderCard({
  provider,
  isActive,
}: {
  provider: ProviderAdapter;
  isActive: boolean;
}) {
  return (
    <article
      className={
        "rounded-2xl border p-5 bg-card text-card-foreground " +
        (isActive ? "ring-1 ring-studio-accent/40" : "")
      }
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] uppercase tracking-widest text-muted-foreground">
              {provider.providerId}
            </span>
            <StatusPill status={provider.status} />
            {isActive ? (
              <span className="text-[10px] font-semibold uppercase tracking-widest text-studio-accent">
                Bound
              </span>
            ) : null}
          </div>
          <h3 className="mt-1 text-[16px] font-semibold tracking-tight">
            {provider.headline}
          </h3>
        </div>
      </div>
      <p className="mt-2 text-[13.5px] leading-[1.55] text-muted-foreground line-clamp-3">
        {provider.description || "No description."}
      </p>
      {provider.tags.length ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {provider.tags.slice(0, 5).map((t) => (
            <span
              key={t}
              className="text-[10px] uppercase tracking-widest text-muted-foreground rounded-full border px-2 py-0.5"
            >
              {t}
            </span>
          ))}
        </div>
      ) : null}
    </article>
  );
}

function StatusPill({ status }: { status: ProviderAdapter["status"] }) {
  const color =
    status === "active"
      ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30"
      : status === "candidate"
        ? "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30"
        : "bg-muted text-muted-foreground border-border";
  return (
    <span
      className={`inline-flex items-center rounded-full border px-1.5 py-0 text-[10px] font-medium uppercase tracking-widest ${color}`}
    >
      {status}
    </span>
  );
}
