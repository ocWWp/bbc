"use server";

import { exec } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { revalidatePath } from "next/cache";
import { bbcRepoRoot } from "@/lib/bbc-paths";
import { requireActor } from "@/lib/auth/require-user";

const execp = promisify(exec);

const PROPOSAL_ID_RE = /^prop_[\w:.-]+$/;

/**
 * SECURITY:
 * - Auth gate at top: every action requires a Supabase-authenticated session
 *   whose profile row was created by the allowlist trigger on auth.users.
 *   The DB trigger is the canonical gate; this server-side check is defense
 *   in depth.
 * - Inputs validated via strict regex before reaching the shell.
 * - The script is invoked with `--actor "human:<provider>:<identifier>"` so
 *   the audit trail captures the real user, not the dashboard host.
 *
 * Limitations:
 * - Still uses child_process.exec; replacing with typed RPC is a future plan.
 * - An allowlisted user can pass any proposal_id matching the regex; per-user
 *   role-based permission is out of scope for V1 (single-org allowlist only).
 */

type Result = { ok: boolean; output: string };

export async function acceptProposal(formData: FormData): Promise<Result> {
  const a = await requireActor();
  if (!a.ok) return { ok: false, output: a.output };

  const id = String(formData.get("id") ?? "");
  if (!PROPOSAL_ID_RE.test(id)) {
    return { ok: false, output: `Invalid proposal_id: ${id}` };
  }
  const root = bbcRepoRoot();
  const script = path.join(root, "scripts", "accept.sh");
  try {
    const { stdout, stderr } = await execp(
      `bash ${shq(script)} ${shq(id)} --actor ${shq(a.actor.actor)}`,
      { cwd: root, timeout: 30000 },
    );
    revalidatePath("/");
    revalidatePath("/queue");
    revalidatePath(`/queue/${id}`);
    revalidatePath("/log");
    return { ok: true, output: [stdout, stderr].filter(Boolean).join("\n") };
  } catch (e: unknown) {
    const err = e as { stdout?: string; stderr?: string; message?: string };
    return {
      ok: false,
      output: [err.stdout, err.stderr, err.message].filter(Boolean).join("\n"),
    };
  }
}

export async function rejectProposal(formData: FormData): Promise<Result> {
  const a = await requireActor();
  if (!a.ok) return { ok: false, output: a.output };

  const id = String(formData.get("id") ?? "");
  const reason = String(formData.get("reason") ?? "");
  if (!PROPOSAL_ID_RE.test(id)) {
    return { ok: false, output: `Invalid proposal_id: ${id}` };
  }
  if (!reason || reason.length > 500) {
    return { ok: false, output: "Reason is required (≤ 500 chars)." };
  }
  const root = bbcRepoRoot();
  const script = path.join(root, "scripts", "reject.sh");
  try {
    const { stdout, stderr } = await execp(
      `bash ${shq(script)} ${shq(id)} --reason ${shq(reason)} --actor ${shq(a.actor.actor)}`,
      { cwd: root, timeout: 30000 },
    );
    revalidatePath("/");
    revalidatePath("/queue");
    revalidatePath(`/queue/${id}`);
    revalidatePath("/log");
    return { ok: true, output: [stdout, stderr].filter(Boolean).join("\n") };
  } catch (e: unknown) {
    const err = e as { stdout?: string; stderr?: string; message?: string };
    return {
      ok: false,
      output: [err.stdout, err.stderr, err.message].filter(Boolean).join("\n"),
    };
  }
}

/** Single-quote the arg for POSIX shells (handles embedded single quotes). */
function shq(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}
