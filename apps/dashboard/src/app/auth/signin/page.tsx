import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { SignInForm } from "./SignInForm";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
};

const ERROR_COPY: Record<string, string> = {
  not_invited:
    "You're not on the allowlist for this dashboard. Ask the admin to add you.",
  invalid_credentials: "Wrong email or password.",
  oauth_failed: "Sign-in with that provider failed. Try again.",
  callback_error: "Auth callback failed. Try again.",
};

export default async function SignInPage({ searchParams }: PageProps) {
  const { callbackUrl, error } = await searchParams;
  const target = callbackUrl ?? "/";

  // Already signed in? Bounce home (or to ?callbackUrl).
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) redirect(target);

  const h = await headers();
  const origin = h.get("origin") ?? `http://${h.get("host") ?? "localhost:3000"}`;
  const redirectTo = `${origin}/auth/callback?next=${encodeURIComponent(target)}`;

  async function signInWithGitHub() {
    "use server";
    const sb = await getSupabaseServerClient();
    const { data, error: e } = await sb.auth.signInWithOAuth({
      provider: "github",
      options: { redirectTo },
    });
    if (e || !data?.url) {
      redirect(`/auth/signin?error=oauth_failed&callbackUrl=${encodeURIComponent(target)}`);
    }
    redirect(data.url);
  }

  async function signInWithGoogle() {
    "use server";
    const sb = await getSupabaseServerClient();
    const { data, error: e } = await sb.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });
    if (e || !data?.url) {
      redirect(`/auth/signin?error=oauth_failed&callbackUrl=${encodeURIComponent(target)}`);
    }
    redirect(data.url);
  }

  return (
    <div style={{ maxWidth: 480, margin: "120px auto", padding: 24 }}>
      <h1>Sign in</h1>
      <p className="muted" style={{ marginBottom: 24 }}>
        BBC dashboard is invite-only. Sign in with an account that's on the allowlist.
      </p>

      {error && ERROR_COPY[error] && (
        <div className="banner warn" style={{ marginBottom: 16 }}>
          {ERROR_COPY[error]}
        </div>
      )}

      <form action={signInWithGitHub}>
        <button className="btn primary" type="submit" style={{ width: "100%", marginBottom: 8 }}>
          Continue with GitHub
        </button>
      </form>

      <form action={signInWithGoogle}>
        <button className="btn" type="submit" style={{ width: "100%", marginBottom: 24 }}>
          Continue with Google
        </button>
      </form>

      <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "16px 0" }}>
        <hr style={{ flex: 1 }} />
        <span className="muted mono-sm">or</span>
        <hr style={{ flex: 1 }} />
      </div>

      <SignInForm callbackUrl={target} />

      <p className="mono-sm" style={{ marginTop: 32 }}>
        After signing in you'll be sent to <code>{target}</code>.
      </p>
    </div>
  );
}
