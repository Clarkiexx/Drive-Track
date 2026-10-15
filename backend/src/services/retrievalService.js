/**
 * Retrieval — two interchangeable scorers behind one contract.
 *
 * Phase 1 (sync, `retrieve`): dependency-free keyword/BM25-lite scoring
 * over the approved in-code corpus (see services/chatKnowledge.js).
 * Phase 2 (async, `retrieveAsync`): pgvector cosine search over the
 * seeded `knowledge_base` table (repositories/knowledgeRepository.js),
 * embedding the question with services/embeddingService.js.
 *
 * Both return scored passages through the same shape
 * ({ passage, score } sorted desc + an explicit `sufficient` gate), so
 * the controller and the LLM prompt builder never care which scorer ran.
 * The sync path stays synchronous and unchanged — it is the fallback for
 * every vector failure (no key, no table, network).
 *
 * Sync scoring (documented for relevance evaluation):
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
 *   - VECTOR_SUFFICIENCY_FLOOR (0.5): the same gate on the vector path's
 *     `1 - cosine distance` scale.
 *
 * Stateless and PII-free: only the question text and public passages are
 * read. No driver, citation, or fine data enters here by design.
 */

const repository = require('../repositories/chatKnowledgeRepository');
const knowledgeRepository = require('../repositories/knowledgeRepository');
const embeddingService = require('./embeddingService');

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

/**
 * Cosine-distance sufficiency floor for the vector path.
 *
 * The lexical floor (SUFFICIENCY_FLOOR = 3) is on a keyword-score scale
 * and cannot be reused: vector scores are `1 - cosine distance`, so a
 * solid topical match lands around 0.6–0.9 and unrelated text near 0.
 * 0.5 (= cosine distance 0.5) keeps only clearly-related passages.
 * Calibrate against the golden question set once vectors are seeded.
 */
const VECTOR_SUFFICIENCY_FLOOR = 0.5;

/**
 * Reads a `metadata` JSONB cell defensively: the driver may hand back an
 * object (normal) or a JSON string (some raw-query paths), and either way
 * source attribution must not blow up the pipeline.
 */
function readMetadata(value) {
  if (!value) return {};
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return {};
    }
  }
  return typeof value === 'object' ? value : {};
}

/**
 * Phase 2 vector retrieval — semantic twin of retrieve(), same contract:
 * `{ ranked, sufficient }` with { passage, score } entries sorted desc.
 *
 * Embeds the question (RETRIEVAL_QUERY) and runs a pgvector cosine
 * search over `knowledge_base`; rows are mapped onto the exact passage
 * shape the prompt builder and source renderer already consume
 * (title = question, text = answer, authority/locator from metadata).
 *
 * Deliberately throws (coded errors) instead of degrading: the controller
 * wraps this in try/catch and falls back to the synchronous keyword path
 * on ANY failure — missing key, missing table, network, empty vector.
 * Only the driver's own question text is embedded; no PII enters here.
 */
async function retrieveAsync(message, limit = DEFAULT_LIMIT) {
  const queryVector = await embeddingService.embedQuery(message);
  const rows = await knowledgeRepository.vectorSearch(queryVector, limit);

  const ranked = rows.map((row) => {
    const metadata = readMetadata(row.metadata);
    const distance = Number(row.distance);
    return {
      passage: {
        title: row.question || 'CTMO guidance',
        text: row.answer || '',
        authority: metadata.authority || 'CTMO',
        locator: metadata.locator || '',
        keywords: [],
      },
      score: 1 - (Number.isFinite(distance) ? distance : 1),
    };
  });

  return {
    ranked,
    sufficient: ranked.length > 0 && ranked[0].score >= VECTOR_SUFFICIENCY_FLOOR,
  };
}

/**
 * Lookup by passage id (used for RAG-grounded system messages such as the
 * out-of-RAG fallback, which quotes the office contact passage instead of
 * hardcoding contact details). Returns the passage or null.
 */
function findPassageById(id) {
  return repository.listActivePassages().find((passage) => passage.id === id) || null;
}

module.exports = {
  retrieve,
  retrieveAsync,
  findLegacyMatch,
  findPassageById,
  scoreAll,
  SUFFICIENCY_FLOOR,
  VECTOR_SUFFICIENCY_FLOOR,
  DEFAULT_LIMIT,
};
