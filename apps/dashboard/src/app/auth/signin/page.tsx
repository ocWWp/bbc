import Link from "next/link";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { FlowBar } from "../../welcome/_steps/flow-bar";
import { BrainView } from "@/components/memory/BrainView";
import { SignInForm } from "./SignInForm";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
};

const AUTH_ERRORS: Record<
  string,
  { code: string; cls: string; msg: React.ReactNode }
> = {
  not_invited: {
    code: "auth.not_invited",
    cls: "is-not-invited",
    msg: (
      <>
        this email isn&apos;t on the invitation list for any workspace on this server.
        ask an admin to send you an invite, or{" "}
        <Link href="/auth/self-serve">create your own tenant ↗</Link>
      </>
    ),
  },
  invalid_credentials: {
    code: "auth.invalid_credentials",
    cls: "is-invalid-credentials",
    msg: <>email or password didn&apos;t match. five more tries before this email is rate-limited for 15 minutes.</>,
  },
  oauth_failed: {
    code: "auth.oauth_failed",
    cls: "is-oauth-failed",
    msg: <>oauth sign-in was cancelled or rejected. nothing changed on our side — retry, or use email + password.</>,
  },
  callback_error: {
    code: "auth.callback_error",
    cls: "is-callback-error",
    msg: <>we couldn&apos;t read the oauth callback (likely a clock-skew between your machine and the provider). retry usually resolves it.</>,
  },
  self_serve_disabled: {
    code: "auth.self_serve_disabled",
    cls: "is-callback-error",
    msg: <>self-serve signup is disabled on this server. ask an admin for an invitation instead.</>,
  },
};

export default async function SignInPage({ searchParams }: PageProps) {
  const { callbackUrl, error } = await searchParams;
  const target = callbackUrl ?? "/";

  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) redirect(target);

  const h = await headers();
  const origin = h.get("origin") ?? `http://${h.get("host") ?? "localhost:3000"}`;
  const redirectTo = `${origin}/auth/callback?next=${encodeURIComponent(target)}`;

  // Default to both OAuth providers enabled. Operators can override via
  // BBC_OAUTH_PROVIDERS=github (or =google) to disable one — useful for
  // self-hosters who haven't configured a Google OAuth app yet. Leaving
  // both off requires explicitly setting BBC_OAUTH_PROVIDERS="" (empty).
  const providerEnv = process.env.BBC_OAUTH_PROVIDERS;
  const enabledProviders =
    providerEnv === undefined
      ? ["github", "google"]
      : providerEnv
          .split(",")
          .map((s) => s.trim().toLowerCase())
          .filter(Boolean);
  const showGitHub = enabledProviders.includes("github");
  const showGoogle = enabledProviders.includes("google");
  const showPassword = true;
  const showSelfServe = process.env.BBC_SIGNUP_MODE === "open";

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

  const errMeta = error ? AUTH_ERRORS[error] : null;

  return (
    <div className="flow">
      <FlowBar
        crumb="/auth/signin"
        right={
          <Link className="flow-bar-link" href="/landing">
            <span>need help? read the docs</span>
            <span>↗</span>
          </Link>
        }
      />
      <div className="auth">
        <section className="auth-form-col">
          <div className="auth-form">
            <span className="auth-eyebrow">
              <span className="dot" />
              <span>sign in · bbc</span>
            </span>
            <h1>back to your <span className="serif">brain</span>.</h1>
            <p className="blurb">
              bbc is invite-only on this server. sign in with whichever method your
              admin authorised for your account.
            </p>

            {errMeta && (
              <div className={`auth-banner ${errMeta.cls}`}>
                <span className="gap" />
                <div className="auth-banner-body">
                  <span className="auth-banner-code">{errMeta.code}</span>
                  <span className="auth-banner-msg">{errMeta.msg}</span>
                </div>
              </div>
            )}

            {(showGitHub || showGoogle) && (
              <div className="oauth-stack">
                {showGitHub && (
                  <form action={signInWithGitHub}>
                    <button className="oauth-btn" type="submit">
                      <span className="glyph">
                        <svg viewBox="0 0 22 22" width="20" height="20" fill="currentColor">
                          <path d="M11 1.5c-5.25 0-9.5 4.25-9.5 9.5 0 4.2 2.72 7.76 6.5 9.02.48.09.65-.21.65-.46v-1.62c-2.64.57-3.2-1.27-3.2-1.27-.43-1.1-1.05-1.39-1.05-1.39-.86-.59.07-.58.07-.58.95.07 1.45.98 1.45.98.85 1.45 2.22 1.03 2.76.79.09-.61.33-1.03.6-1.27-2.1-.24-4.32-1.05-4.32-4.68 0-1.03.37-1.88.98-2.54-.1-.24-.42-1.21.09-2.52 0 0 .8-.26 2.62.97A9.12 9.12 0 0 1 11 6.05c.81 0 1.62.11 2.38.32 1.82-1.23 2.62-.97 2.62-.97.52 1.31.19 2.28.1 2.52.61.66.98 1.51.98 2.54 0 3.64-2.22 4.44-4.34 4.67.34.29.64.86.64 1.74v2.58c0 .25.17.55.66.45 3.78-1.26 6.5-4.82 6.5-9.02 0-5.25-4.25-9.5-9.5-9.5z" />
                        </svg>
                      </span>
                      <span>continue with GitHub</span>
                      <span className="tail">oauth</span>
                    </button>
                  </form>
                )}
                {showGoogle && (
                  <form action={signInWithGoogle}>
                    <button className="oauth-btn" type="submit">
                      <span className="glyph">
                        <svg viewBox="0 0 22 22" width="20" height="20">
                          <path d="M20.7 11.23c0-.65-.06-1.27-.17-1.87H11v3.54h5.43c-.23 1.25-.94 2.3-2 3.01v2.5h3.23c1.89-1.74 2.98-4.31 2.98-7.18z" fill="#4285F4" />
                          <path d="M11 21c2.7 0 4.96-.9 6.61-2.42l-3.23-2.5c-.89.6-2.04.96-3.38.96-2.6 0-4.8-1.75-5.59-4.11H2.07v2.58A9.99 9.99 0 0 0 11 21z" fill="#34A853" />
                          <path d="M5.41 12.93A6 6 0 0 1 5.09 11c0-.67.12-1.32.32-1.93V6.49H2.07A9.98 9.98 0 0 0 1 11c0 1.62.39 3.14 1.07 4.51l3.34-2.58z" fill="#FBBC05" />
                          <path d="M11 4.96c1.47 0 2.79.5 3.83 1.5l2.87-2.86A9.97 9.97 0 0 0 11 1a9.99 9.99 0 0 0-8.93 5.49l3.34 2.58C6.2 6.71 8.4 4.96 11 4.96z" fill="#EA4335" />
                        </svg>
                      </span>
                      <span>continue with Google</span>
                      <span className="tail">oauth</span>
                    </button>
                  </form>
                )}
              </div>
            )}

            {showPassword && (showGitHub || showGoogle) && (
              <div className="auth-divider">or with email</div>
            )}

            {showPassword && <SignInForm callbackUrl={target} hasError={error === "invalid_credentials"} />}

            <div className="auth-foot">
              {showSelfServe && (
                <span>
                  no invitation?{" "}
                  <Link href="/auth/self-serve">create your own tenant ↗</Link>
                </span>
              )}
              <span className="legal">
                by signing in you accept the <a href="/terms">terms</a> and{" "}
                <a href="/privacy">privacy</a> policy of this workspace operator.
              </span>
            </div>
          </div>
        </section>

        <aside className="auth-aside">
          <div className="auth-aside-bg">
            <div className="brain-embed">
              <BrainView nodes={[]} embedded />
            </div>
          </div>
          <div className="auth-aside-head">
            <span className="lab">/// big brain company</span>
            <h2 className="h">
              a brain you can <span className="serif">read</span>.<br />
              a brain you can <span className="serif">audit</span>.
            </h2>
            <p className="b">
              every memory is typed, human-reviewed, and citable. no vector store,
              no ranking roulette — retrieval is by supertag + filter, deterministic
              by design.
            </p>
          </div>

          <div className="auth-aside-spec">
            <div className="row"><span className="k">edition</span><span className="v">self-hosted · open source</span></div>
            <div className="row"><span className="k">license</span><span className="v">AGPLv3 · MIT for spec</span></div>
            <div className="row"><span className="k">after sign-in</span><span className="v">{target}</span></div>
          </div>
        </aside>
      </div>
    </div>
  );
}
