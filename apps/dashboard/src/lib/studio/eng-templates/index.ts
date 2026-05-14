// Engineering Studio template registry entry point. Side-effect imports
// register each template; consumers call getEngTemplate / listEngTemplates.

import "./adr-draft";
import "./vendor-swap";
import "./tech-debt-review";

export {
  getEngTemplate,
  listEngTemplates,
  listClientEngTemplates,
  registerEngTemplate,
} from "./registry";

export type { ClientEngTemplate } from "./registry";
