// Legal Studio template registry entry point. Side-effect imports register
// each template; consumers call getLegalTemplate / listLegalTemplates.

import "./nda";
import "./contractor-agreement";
import "./ip-assignment";
import "./tos-privacy";
import "./employment-terms";

export {
  getLegalTemplate,
  listLegalTemplates,
  listClientLegalTemplates,
  registerLegalTemplate,
} from "./registry";

export type { ClientLegalTemplate } from "./registry";
