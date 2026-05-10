import { redirect } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

export const dynamic = "force-dynamic";

type InviteRow = {
  out_email: string;
  out_provider: string;
  out_role: "admin" | "member" | "viewer";
  out_tenant_slug: string;
  out_tenant_name: string;
  out_consumed: boolean;
};

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Server misconfigured: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required");
  }
  return createClient<Database>(url, key, { auth: { persistSession: false } });
}

export default async function InviteLandingPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  // Validate UUID-ish shape before round-tripping to the DB.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)) {
    redirect("/auth/signin?error=invalid_invite");
  }

  let row: InviteRow;
  try {
    const sb = adminClient();
    const { data, error } = await sb.rpc("resolve_invitation_token", { p_token: token });
    if (error) throw new Error(error.message);
    if (!data || (Array.isArray(data) && data.length === 0)) {
      throw new Error("invitation not found");
    }
    row = (Array.isArray(data) ? data[0] : data) as InviteRow;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error(`[invite] resolve failed for token=${token}: ${(e as Error).message}`);
    redirect("/auth/signin?error=invalid_invite");
  }

  return (
    <main style={{ maxWidth: 520, margin: "120px auto", padding: 24 }}>
      <h1>Join {row.out_tenant_name} on BBC</h1>
      <p className="muted" style={{ marginBottom: 16 }}>
        You've been invited to <strong>{row.out_tenant_slug}</strong> as <strong>{row.out_role}</strong>.
        {row.out_consumed && (
          <>
            {" "}
            <span className="banner warn">This invitation was already used. If you have an account,
            sign in normally.</span>
          </>
        )}
      </p>

      <div style={{ marginTop: 24 }}>
        <p>
          To accept, sign up with the invited address:{" "}
          <code>{row.out_email}</code>
        </p>
        <a
          href={`/auth/signin?email=${encodeURIComponent(row.out_email)}&source=invite`}
          className="btn primary"
          style={{ display: "inline-block", padding: "10px 18px", marginTop: 8 }}
        >
          Continue to sign in / sign up →
        </a>
      </div>

      <p className="mono-sm muted" style={{ marginTop: 32 }}>
        New to BBC? You'll create your password on the next screen. The email is locked to the
        address that was invited.
      </p>
    </main>
  );
}
