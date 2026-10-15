const { success, fail } = require('../utils/response');
const retrievalService = require('../services/retrievalService');
const llmService = require('../services/llmService');

// Boot note only — never per-message. Chat is stateless in Phase 1 and
// message content is never logged anywhere in this pipeline.
// eslint-disable-next-line no-console
if (!llmService.isConfigured()) console.warn('[chatbot] RAG generative answers disabled: LLM_API_KEY is not set. Curated passages only.');

const DEFAULT_ANSWER =
  "I'm not sure how to help with that specific question yet. For anything not covered here, please visit the CTMO office or call our hotline during office hours.";

const QUICK_QUESTIONS = [
  'How to settle violations?',
  'Where is CTMO office?',
  'What are the penalties?',
  'How to appeal?',
];

/**
 * Verifiable source reference for a passage: title + issuing authority +
 * locator, matching the approved knowledge metadata. No URLs or PII.
 */
function toSource(passage) {
  return {
    title: passage.title || 'CTMO guidance',
    authority: passage.authority || 'CTMO',
    locator: passage.locator || '',
  };
}

/**
 * POST /chatbot/ask — { message: string }.
 *
 * Phase 1 RAG pipeline (all approved content, no personal data, stateless):
 *   1. Fast path — the pre-RAG keyword match answers verbatim (byte-identical
 *      legacy behavior) plus verifiable sources.
 *   2. Retrieval + sufficiency gate — vector search first (Phase 2,
 *      pgvector), keyword scorer as its fallback; a relevant non-legacy
 *      match answers from its curated passage; below the floor, the
 *      default answer.
 *   3. Generative zone — structural only until LLM credentials exist (the
 *      reported Phase 1 blocker): with a provider configured, generation
 *      runs grounded on the ranked passages; any generative failure degrades
 *      to curated passages, never a 500 — a chat answer falls back, it does
 *      not fail the request.
 */
async function ask(req, res) {
  const { message } = req.body;
  if (!message || !message.trim()) {
    return fail(res, 'A message is required', 422);
  }

  const legacy = retrievalService.findLegacyMatch(message);
  if (legacy) {
    return success(
      res,
      {
        answer: legacy.text,
        quickQuestions: QUICK_QUESTIONS,
        sources: [toSource(legacy)],
      }
    );
  }

  // Phase 2: semantic (pgvector) retrieval first — embeds the question and
  // ranks seeded `knowledge_base` passages. Vector retrieval is best-effort
  // only: on ANY failure (LLM key missing, table not seeded, network, empty
  // vector) it degrades to the synchronous keyword scorer below, so a chat
  // answer always falls back, it never fails the request.
  let ranked;
  let sufficient;
  try {
    const vectorResult = await retrievalService.retrieveAsync(message);
    ranked = vectorResult.ranked;
    sufficient = vectorResult.sufficient;
  } catch {
    const syncResult = retrievalService.retrieve(message);
    ranked = syncResult.ranked;
    sufficient = syncResult.sufficient;
  }

  if (!sufficient) {
    return success(
      res,
      { answer: DEFAULT_ANSWER, quickQuestions: QUICK_QUESTIONS, sources: [] }
    );
  }

  if (llmService.isConfigured()) {
    try {
      const generated = await llmService.generate({
        question: message,
        passages: ranked,
        key: `driver:${req.user.id}`,
      });
      return success(
        res,
        {
          answer: generated.answer,
          quickQuestions: QUICK_QUESTIONS,
          sources: ranked.map(({ passage }) => toSource(passage)),
        }
      );
    } catch {
      // Fall through to the curated fallback below.
    }
  }

  const top = ranked[0];
  return success(
    res,
    {
      answer: top.passage.text,
      quickQuestions: QUICK_QUESTIONS,
      sources: ranked.map(({ passage }) => toSource(passage)),
    }
  );
}

module.exports = { ask };
