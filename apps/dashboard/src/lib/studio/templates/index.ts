// Marketing Studio template registry entry point. Side-effect imports register
// each template on the shared Map; consumers call `getTemplate(id)` /
// `listTemplates()` / `listTemplateSummaries()` from `./registry`.

import "./single-x-post";
import "./tweet-thread";
import "./threads-post";
import "./linkedin-announcement";
import "./cross-platform-campaign";
import "./reel-script";
import "./blog-post-draft";
import "./voice-consistency-check";
import "./hashtag-strategy";
import "./custom";

export {
  getTemplate,
  listTemplates,
  listTemplateSummaries,
  registerTemplate,
} from "./registry";

export type {
  Template,
  PreviewKind,
  FirstUseInput,
  FirstUseInputKind,
  BrainSummary,
  OverrideRule,
  BuildPromptArgs,
} from "./types";
