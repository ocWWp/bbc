// Shared retrieval helpers for Support Studio. Deterministic substring +
// token-overlap matching over BrainSummary fields -- no embedding lookup.
// Embeddings are a v1.1 upgrade; for v1, naive word-overlap is enough to
// surface "similar shipped" / "relevant decisions" / "matching vendors"
// candidates before the LLM drafts a reply.
//
// Used by feature-request-triage (all three probes), bug-ack (vendors +
// decisions), and churn-save (decisions only -- the churn-save template
// passes brain.recent_decisions wholesale, so it doesn't import from here).

import type { BrainSummary } from "./types";

const STOPWORDS = new Set([
  "a", "an", "and", "the", "for", "to", "of", "in", "on", "at", "by",
  "is", "it", "this", "that", "with", "as", "be", "are", "was", "were",
  "i", "we", "you", "they", "he", "she", "or", "but", "if", "so",
  "can", "could", "would", "should", "do", "does", "did", "have", "has",
  "had", "will", "shall", "may", "might", "my", "your", "our", "their",
  "me", "us", "them", "him", "her", "from", "up", "down", "out",
]);

// Lowercase, strip punctuation, drop stopwords, return unique stems-ish (no
// proper stemmer for v1; trailing 's' trimmed for crude plural collapsing).
export function tokenize(text: string): Set<string> {
  const tokens = (text ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .map((t) => t.replace(/s$/, ""))
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t));
  return new Set(tokens);
}

function overlapScore(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let hits = 0;
  for (const t of b) if (a.has(t)) hits++;
  return hits;
}

// Up to N decisions whose title or decision text shares 2+ tokens with the
// query. Stable order: highest overlap first, then original brain order.
export function findRelevantDecisions(
  query: string,
  decisions: BrainSummary["recent_decisions"],
  limit = 3,
): BrainSummary["recent_decisions"] {
  if (!decisions || decisions.length === 0) return [];
  const qTokens = tokenize(query);
  if (qTokens.size === 0) return [];

  const scored = decisions
    .map((d, i) => {
      const dTokens = tokenize(`${d.title} ${d.decision}`);
      return { d, score: overlapScore(qTokens, dTokens), order: i };
    })
    .filter((r) => r.score >= 2)
    .sort((a, b) => (b.score - a.score) || (a.order - b.order));

  return scored.slice(0, limit).map((r) => r.d);
}

// Differentiators from product memory that share 2+ tokens with the query.
// product.differentiators is the closest BrainSummary surface to "shipped
// features list" -- a v1.1 upgrade would scan all product memory rows, not
// just the differentiators of the primary product record.
export function findSimilarShipped(
  query: string,
  product: BrainSummary["product"],
  limit = 3,
): string[] {
  if (!product || product.differentiators.length === 0) return [];
  const qTokens = tokenize(query);
  if (qTokens.size === 0) return [];

  const scored = product.differentiators
    .map((d, i) => ({ d, score: overlapScore(qTokens, tokenize(d)), order: i }))
    .filter((r) => r.score >= 2)
    .sort((a, b) => (b.score - a.score) || (a.order - b.order));

  return scored.slice(0, limit).map((r) => r.d);
}

// Vendors whose name or role overlaps the query. Used by bug-ack (recognize
// "Stripe webhook" -> Stripe vendor record) and feature-request-triage
// (workaround paragraph cites a vendor we already use).
export function findRelevantVendors(
  query: string,
  vendors: BrainSummary["vendors"],
  limit = 2,
): BrainSummary["vendors"] {
  if (!vendors || vendors.length === 0) return [];
  const qTokens = tokenize(query);
  if (qTokens.size === 0) return [];

  const scored = vendors
    .map((v, i) => {
      const vTokens = tokenize(`${v.name} ${v.role}`);
      return { v, score: overlapScore(qTokens, vTokens), order: i };
    })
    .filter((r) => r.score >= 1) // vendor names are short -- 1 hit is enough
    .sort((a, b) => (b.score - a.score) || (a.order - b.order));

  return scored.slice(0, limit).map((r) => r.v);
}
