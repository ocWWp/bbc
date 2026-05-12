// Support Studio template registry entry point. Side-effect imports register
// each template; consumers call getSupportTemplate / listSupportTemplates.
//
// Templates are registered one per commit. New templates land here as they
// ship; an empty registry is valid (the page renders a "no workflows yet"
// state via the existing client component).

import "./customer-reply";
import "./churn-save";
import "./feature-request-triage";
import "./bug-ack";

export {
  getSupportTemplate,
  listSupportTemplates,
  listClientSupportTemplates,
  registerSupportTemplate,
} from "./registry";

export type { ClientSupportTemplate } from "./registry";
