import "./strategic-memo";
import "./board-update";
import "./weekly-recap";
import "./investor-update";
import "./hiring-plan";

export {
  getFounderTemplate,
  listFounderTemplates,
  listClientFounderTemplates,
  registerFounderTemplate,
} from "./registry";

export type { ClientFounderTemplate } from "./registry";
