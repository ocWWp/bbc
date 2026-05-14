// Engineering Studio template registry entry point. Side-effect imports
// register each template; consumers call getEngTemplate / listEngTemplates.

import "./adr-draft";
import "./vendor-swap";
import "./tech-debt-review";
import "./incident-retro";
import "./rfc-draft";

export {
  getEngTemplate,
  listEngTemplates,
  listClientEngTemplates,
  registerEngTemplate,
} from "./registry";

export type { ClientEngTemplate } from "./registry";
