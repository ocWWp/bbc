// People/HR Studio template registry entry point. Side-effect imports register
// each template; consumers call getHrTemplate / listHrTemplates.

import "./job-description";
import "./offer-letter";
import "./onboarding-plan";
import "./review-template";
import "./comp-band-rationale";

export {
  getHrTemplate,
  listHrTemplates,
  listClientHrTemplates,
  registerHrTemplate,
} from "./registry";

export type { ClientHrTemplate } from "./registry";
