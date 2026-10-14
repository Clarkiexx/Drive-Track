/**
 * Phase 1 retrieval — dependency-free keyword/BM25-lite scoring over the
 * approved in-code corpus (see services/chatKnowledge.js).
 *
 * Deliberately NOT semantic/vector search: pgvector is a Phase 2 decision
 * and no embedding service is configured. This module returns scored
 * passages through the same shape a vector retriever will later produce
 * ({ passage, score } sorted desc), so swapping the scorer never touches
 * the controller or the LLM prompt builder.
 *
 * Scoring (documented for relevance evaluation):
 *   - curated keyword substring hit (the pre-RAG signal): +3 each
 *   - query term in passage title: +2 each
 *   - query term in passage text: +1 each (frequency-capped at 3)
 * Thresholds:
 *   - Legacy fast path: the FIRST passage with any keyword hit answers
 *     verbatim — byte-identical to the pre-RAG matcher, so existing
 *     behavior cannot regress.
 *   - SUFFICIENCY_FLOOR (3): a non-legacy best match at/above this is
 *     relevant enough to answer from; below it the controller falls back
 *     to the default answer. Calibrated against the golden question set
 *     (see the Phase 1 build report); re-tune when the corpus grows.
 *
 * Stateless and PII-free: only the question text and public passages are
 * read. No driver, citation, or fine data enters here by design.
 */

const repository = require('../repositories/chatKnowledgeRepository');

const KEYWORD_WEIGHT = 3;
const TITLE_WEIGHT = 2;
const TEXT_WEIGHT = 1;
const TEXT_HIT_CAP = 3;
const SUFFICIENCY_FLOOR = 3;
const DEFAULT_LIMIT = 3;

function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function scorePassage(passage, normalizedQuery, queryTokens) {
  let score = 0;
  let keywordHits = 0;

  for (const keyword of passage.keywords || []) {
    if (normalizedQuery.includes(String(keyword).toLowerCase())) {
      keywordHits += 1;
      score += KEYWORD_WEIGHT;
    }
  }

  const titleTokens = new Set(tokenize(passage.title));
  const textTokens = tokenize(passage.text);
  const textCounts = new Map();
  for (const token of textTokens) {
    textCounts.set(token, (textCounts.get(token) || 0) + 1);
  }

  for (const token of new Set(queryTokens)) {
    if (titleTokens.has(token)) score += TITLE_WEIGHT;
    const hits = textCounts.get(token) || 0;
    if (hits > 0) score += Math.min(hits, TEXT_HIT_CAP) * TEXT_WEIGHT;
  }

  return { score, keywordHits };
}

function scoreAll(message) {
  const normalized = String(message || '').toLowerCase();
  const queryTokens = tokenize(normalized);
  return repository
    .listActivePassages()
    .map((passage) => ({ passage, ...scorePassage(passage, normalized, queryTokens) }))
    .sort((a, b) => b.score - a.score);
}

/**
 * Pre-RAG behavior, preserved exactly: the first passage (corpus order)
 * with any keyword substring hit. The controller answers these verbatim.
 */
function findLegacyMatch(message) {
  const normalized = String(message || '').toLowerCase();
  const passages = repository.listActivePassages();
  const found = passages.find((passage) =>
    (passage.keywords || []).some((keyword) =>
      normalized.includes(String(keyword).toLowerCase())
    )
  );
  return found || null;
}

/**
 * Ranked retrieval for non-legacy questions.
 * Returns { ranked, sufficient } — `sufficient` is the explicit
 * sufficiency check the controller gates answering on.
 */
function retrieve(message, limit = DEFAULT_LIMIT) {
  const ranked = scoreAll(message).filter((entry) => entry.score > 0).slice(0, limit);
  return {
    ranked,
    sufficient: ranked.length > 0 && ranked[0].score >= SUFFICIENCY_FLOOR,
  };
}

module.exports = {
  retrieve,
  findLegacyMatch,
  scoreAll,
  SUFFICIENCY_FLOOR,
  DEFAULT_LIMIT,
};
