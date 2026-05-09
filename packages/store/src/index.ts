export type {
  Proposal,
  ProposalStatus,
  LogEntry,
  Binding,
  Store,
  QueueStore,
  LogStore,
  BindingsStore,
} from "./interfaces";

export { LocalStore } from "./local/index";
export { SupabaseStore } from "./supabase/index";
