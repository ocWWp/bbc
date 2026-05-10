import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { SelfServeForm } from "./SelfServeForm";

export const dynamic = "force-dynamic";

export default async function SelfServePage() {
  if (process.env.BBC_SIGNUP_MODE !== "open") {
    redirect("/auth/signin?error=self_serve_disabled");
  }

  // Detect logged-in state. Two flows:
  //   1. Not logged in → create user + tenant + admin atomically (signup mode).
  //   2. Logged in → just create another tenant; the existing auth user becomes its admin.
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  const loggedIn = !!user;

  return (
    <div style={{ maxWidth: 480, margin: "120px auto", padding: 24 }}>
      <h1>{loggedIn ? "Create another tenant" : "Create your own BBC tenant"}</h1>
      <p className="muted" style={{ marginBottom: 24 }}>
        {loggedIn ? (
          <>You'll become the admin of the new tenant. Your existing tenants stay untouched.</>
        ) : (
          <>This BBC instance allows self-service signup. Pick a tenant name and your account becomes the admin. You can invite teammates after.</>
        )}
      </p>
      <SelfServeForm loggedIn={loggedIn} email={user?.email ?? ""} />
      <p className="mono-sm" style={{ marginTop: 32 }}>
        {loggedIn ? (
          <><a href="/team">← Back to /team</a></>
        ) : (
          <>Already have an invitation? <a href="/auth/signin">Sign in normally</a>.</>
        )}
      </p>
    </div>
  );
}
