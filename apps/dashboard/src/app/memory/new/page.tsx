import Link from "next/link";
import { redirect } from "next/navigation";
import { requireActor } from "@/lib/auth/require-user";
import { WorkspaceCrumb } from "@/components/WorkspaceCrumb";
import { TypePicker } from "./type-picker";

export const metadata = { title: "New memory — BBC" };
export const dynamic = "force-dynamic";

export default async function NewMemoryPage() {
  const a = await requireActor();
  if (!a.ok) redirect("/auth/signin?callbackUrl=%2Fmemory%2Fnew");
  return (
    <div className="container page">
      <header className="page-head">
        <div className="page-head-left">
          <div className="page-crumb">
            <WorkspaceCrumb tenantSlug={a.actor.tenant_slug} />
            <span className="sep">/</span>
            <Link href="/memory">memory</Link>
            <span className="sep">/</span>
            <span className="current">new</span>
          </div>
          <h1 className="page-title">create a memory</h1>
          <p className="page-blurb">
            Pick a type. Agents query by type, so this choice shapes how
            and when the item gets used.
          </p>
        </div>
      </header>

      <TypePicker />
    </div>
  );
}
