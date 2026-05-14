// Single source of truth for studio input length bounds. Both the per-role run
// actions and the shared previewPlan read from here, so a plan can never be
// previewed under looser bounds than the run will enforce. Values verified
// against the current run actions -- do not change without checking each.
import type { StudioRole } from "@/lib/studio/template-id";

export const TASK_MIN_LEN = 8;

export const TASK_MAX_LEN: Record<StudioRole, number> = {
  marketing: 500,
  engineering: 600,
  founder: 800,
  designer: 800,
  support: 600,
  finance: 600,
  legal: 600,
  hr: 600,
};

// Per-value cap on each firstUseInput string, per role. Matches the current
// `inputsRecordSchema` z.string().max(...) in each run action.
export const INPUT_MAX_LEN: Record<StudioRole, number> = {
  marketing: 2000,
  engineering: 3000,
  founder: 3000,
  support: 3000,
  designer: 5000,
  finance: 5000,
  legal: 5000,
  hr: 5000,
};
