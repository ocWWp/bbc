import { redirect } from "next/navigation";
import { requireActor } from "@/lib/auth/require-user";
import { readInbox } from "@/lib/inbox/read-inbox";
import { Inbox } from "./_components/Inbox";

export const dynamic = "force-dynamic";

export const metadata = { title: "Inbox · BBC" };

/**
 * Member-facing notification surface. Available to every signed-in role —
 * admins and operators may also receive Loop-3 fan-outs and resolved flags.
 */
export default async function InboxPage() {
  const a = await requireActor();
  if (!a.ok) redirect("/auth/signin?callbackUrl=/inbox");

  const view = await readInbox();
  return <Inbox view={view} />;
}
