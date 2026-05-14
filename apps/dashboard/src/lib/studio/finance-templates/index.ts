// Finance Studio template registry entry point. Side-effect imports register
// each template; consumers call getFinanceTemplate / listFinanceTemplates.

import "./board-financials";
import "./budget-memo";
import "./investor-numbers";
import "./expense-policy";
import "./runway-analysis";

export {
  getFinanceTemplate,
  listFinanceTemplates,
  listClientFinanceTemplates,
  registerFinanceTemplate,
} from "./registry";

export type { ClientFinanceTemplate } from "./registry";
