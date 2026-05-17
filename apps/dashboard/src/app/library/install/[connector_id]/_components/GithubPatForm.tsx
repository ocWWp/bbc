"use client";

/**
 * GithubPatForm — client component that wraps the installGithubPat server
 * action (Task 9) in a form. Three inputs: pat (password), owner, repo.
 *
 * React 19 useActionState pattern: the action's return value becomes the
 * form state. On ok=true we router.push to /library?installed=github so
 * the library surface re-reads tenant_connectors and shows the freshly
 * installed row. On ok=false we render the action's error string verbatim
 * — the server action already classifies the GitHub failure modes
 * (invalid_token / insufficient_scope / network).
 */

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  installGithubPat,
  type InstallGithubPatResult,
} from "../../_actions";

type FormState = InstallGithubPatResult | null;

async function action(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  return installGithubPat(formData);
}

export function GithubPatForm() {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState<FormState, FormData>(
    action,
    null,
  );

  useEffect(() => {
    if (state?.ok) {
      router.push("/library?installed=github");
    }
  }, [state, router]);

  const error = state && !state.ok ? state.error : null;

  return (
    <div className="container page" style={{ maxWidth: 640 }}>
      <header className="page-head" style={{ marginBottom: 24 }}>
        <h1 className="page-title">Install GitHub</h1>
        <p className="page-blurb">
          Paste a GitHub Personal Access Token with <code className="mono">repo</code>{" "}
          scope. BBC encrypts the token per-tenant before storing and never
          sends it back to the browser.
        </p>
      </header>

      <form action={formAction} className="card card-pad" style={{ display: "grid", gap: 16 }}>
        <label style={{ display: "grid", gap: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 500 }}>
            Personal Access Token
          </span>
          <Input
            name="pat"
            type="password"
            required
            minLength={10}
            maxLength={2000}
            placeholder="ghp_… or github_pat_…"
            autoComplete="off"
            spellCheck={false}
            className="font-mono"
            disabled={isPending}
          />
          <span className="muted" style={{ fontSize: 12 }}>
            Create one at github.com/settings/tokens with the{" "}
            <code className="mono">repo</code> scope.
          </span>
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 500 }}>Owner</span>
          <Input
            name="owner"
            type="text"
            required
            maxLength={100}
            placeholder="acme-corp"
            autoComplete="off"
            spellCheck={false}
            disabled={isPending}
          />
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 500 }}>Repository</span>
          <Input
            name="repo"
            type="text"
            required
            maxLength={100}
            placeholder="docs"
            autoComplete="off"
            spellCheck={false}
            disabled={isPending}
          />
        </label>

        {error ? (
          <div role="alert" style={{ fontSize: 14, color: "var(--destructive, #dc2626)" }}>
            {error}
          </div>
        ) : null}

        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <Button type="submit" variant="default" disabled={isPending}>
            {isPending ? "Installing…" : "Install"}
          </Button>
        </div>
      </form>
    </div>
  );
}
