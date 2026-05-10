import { redirect } from "next/navigation";
import { SelfServeForm } from "./SelfServeForm";

export const dynamic = "force-dynamic";

export default function SelfServePage() {
  if (process.env.BBC_SIGNUP_MODE !== "open") {
    redirect("/auth/signin?error=self_serve_disabled");
  }
  return (
    <div style={{ maxWidth: 480, margin: "120px auto", padding: 24 }}>
      <h1>Create your own BBC tenant</h1>
      <p className="muted" style={{ marginBottom: 24 }}>
        This BBC instance allows self-service signup. Pick a tenant name and your account becomes
        the admin. You can invite teammates after.
      </p>
      <SelfServeForm />
      <p className="mono-sm" style={{ marginTop: 32 }}>
        Already have an invitation? <a href="/auth/signin">Sign in normally</a>.
      </p>
    </div>
  );
}
