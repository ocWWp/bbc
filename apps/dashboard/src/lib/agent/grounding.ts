// GroundingVerifier — strips ungrounded claims, not just chips.
//
// The LLM may invent memory IDs that look plausible (`mem_2025-01-13_...`)
// but don't exist. If we only stripped the chip, the surrounding claim
// would stay — which is exactly the "AI hallucinates a citation" failure
// mode this library exists to prevent.
//
// Policy: any sentence containing a [mem:<id>] marker MUST resolve every
// marker to a retrieved id. If a sentence carries even one invalid
// marker, the whole sentence is downgraded into the "related memories
// fallback" sentence appended to the output.
//
// Sentences with NO memory marker pass through unchanged. Those are
// either inference-level utterances (often carrying [inference:] markers
// that surface tentativeness in the UI) or voice-level utterances (e.g.
// "Welcome back.") that do not make memory-grounded claims.

export type GroundingResult = {
  /** The cleaned text — invalid sentences removed, optionally with a fallback appended. */
  text: string;
  /** De-duplicated valid memory IDs that survived verification. */
  citations: string[];
  /** Sentences that were stripped because they cited invalid IDs. */
  ungroundedClaims: string[];
};

const MEM_MARKER = /\[mem:([a-zA-Z0-9_-]+)\]/g;
const FALLBACK =
  "I found these related memories — but couldn't ground a specific claim.";

/**
 * Parse LLM-generated text for citation markers and remove any sentence
 * whose markers don't all resolve.
 *
 * @param text The LLM's raw output.
 * @param retrievedIds Memory IDs the LLM is permitted to cite (the actual
 *   result set from this turn's retrieval step).
 */
export function verifyGrounding(
  text: string,
  retrievedIds: readonly string[],
): GroundingResult {
  const valid = new Set(retrievedIds);
  const citations: string[] = [];
  const ungrounded: string[] = [];

  // Split on sentence boundaries. Keep punctuation; rejoin with single
  // space so the output reads naturally even after drops.
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const kept: string[] = [];
  for (const sentence of sentences) {
    const markers = [...sentence.matchAll(MEM_MARKER)].map((m) => m[1]);

    if (markers.length === 0) {
      // No memory citation — pass through. Inference-level utterances.
      kept.push(sentence);
      continue;
    }

    const invalid = markers.filter((id) => !valid.has(id));
    if (invalid.length === 0) {
      kept.push(sentence);
      for (const m of markers) citations.push(m);
      continue;
    }

    // Strict policy: any invalid marker downgrades the whole sentence.
    ungrounded.push(sentence);
  }

  let out = kept.join(" ");
  if (ungrounded.length > 0) {
    out = out.length > 0 ? `${out} ${FALLBACK}` : FALLBACK;
  }

  return {
    text: out,
    citations: [...new Set(citations)],
    ungroundedClaims: ungrounded,
  };
}
