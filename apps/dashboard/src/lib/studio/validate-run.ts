// Shared output validation for studio runs.
//
// Lifted from the duplicated cleanup loops across the 5 studio actions
// (marketing, founder, designer, engineering, support). Imported skills
// also use this; their citation_contract from the parsed manifest drives
// the policy.
//
// Spec: docs/skill-md-bbc-spec.md §3 (citation_contract semantics).
// AT-PI-2: this helper is the second layer of defense against memory-ID
// exfiltration -- the LLM cannot smuggle out IDs it doesn't have via
// <cite mem_id="..."/> because we strip unknown IDs here.

import { cleanBlockCitations, type OutputBlock } from "./output-blocks";

export type CitationContract = "required" | "encouraged" | "none";

export type ValidateRunInput = {
  blocks: OutputBlock[];
  citedMemoryIds: string[];
  knownMemoryIds: Set<string>;
  citationContract: CitationContract;
};

export type ValidateRunOk = {
  ok: true;
  blocks: OutputBlock[];
  citedMemoryIds: string[];
  droppedCitations: number;
  droppedIds: number;
};

export type ValidateRunErr = {
  ok: false;
  error: string;
};

export type ValidateRunResult = ValidateRunOk | ValidateRunErr;

export function validateRun(input: ValidateRunInput): ValidateRunResult {
  const { blocks, citedMemoryIds, knownMemoryIds, citationContract } = input;

  let droppedCitations = 0;
  const cleanedBlocks: OutputBlock[] = blocks.map((b) => {
    const { block, stripped } = cleanBlockCitations(b, knownMemoryIds);
    droppedCitations += stripped;
    return block;
  });

  const validCitedIds = citedMemoryIds.filter((id) => knownMemoryIds.has(id));
  const droppedIds = citedMemoryIds.length - validCitedIds.length;

  if (citationContract === "required" && validCitedIds.length === 0) {
    return {
      ok: false,
      error:
        "citation_contract: required -- the skill declared every claim must cite a memory, but the run produced no valid citations. " +
        (droppedIds > 0
          ? `${droppedIds} fabricated id(s) were rejected.`
          : "The model emitted no <cite mem_id> tags."),
    };
  }

  return {
    ok: true,
    blocks: cleanedBlocks,
    citedMemoryIds: validCitedIds,
    droppedCitations,
    droppedIds,
  };
}
