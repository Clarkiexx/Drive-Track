/**
 * Embedding service — the pgvector half of the RAG layer (Phase 2).
 *
 * Model: `gemini-embedding-001` at `outputDimensionality: 768`, matching
 * the `vector(768)` column created by repositories/knowledgeRepository.js.
 * (The reference implementation used `text-embedding-004`, which Google
 * shut down in Jan 2026 — this is its replacement.)
 *
 * Client: the official `@google/generative-ai` SDK (same client as
 * llmService.js), credentials from backend env only (`LLM_API_KEY`) —
 * never stored, never logged, never returned to the frontend.
 *
 * SDK note: `@google/generative-ai` ^0.24.1 types omit `outputDimensionality`
 * on `EmbedContentRequest`, but `embedContent()` JSON.stringifies the
 * request verbatim, so the field reaches the API. This file is plain
 * CommonJS JS (no type-checking); if it is ever ported to TypeScript the
 * request object needs a cast.
 *
 * Contract (mirrors llmService.js conventions): every failure mode throws
 * an Error with a coded `err.code` — LLM_NOT_CONFIGURED (no key),
 * LLM_NETWORK_ERROR (unreachable / timeout), LLM_EMPTY_RESPONSE (no usable
 * vector) — so callers can degrade instead of failing the request.
 *
 * Stateless and PII-free: only the caller's text is sent; no driver,
 * citation, or fine data enters here by design.
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');

// text-embedding-004 was shut down Jan 2026; 001 is its successor.
const MODEL = process.env.LLM_EMBEDDING_MODEL || 'gemini-embedding-001';
const DIMENSIONS = 768;
const REQUEST_TIMEOUT_MS = 20000;

function isConfigured() {
  return Boolean(process.env.LLM_API_KEY);
}

function getModel() {
  return MODEL;
}

function codedError(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

/**
 * Default client factory (seam for stubbed verification — tests inject a
 * fake factory so no network or quota is ever spent).
 */
function defaultClientFactory(apiKey) {
  const client = new GoogleGenerativeAI(apiKey);
  return client.getGenerativeModel({ model: MODEL });
}

/**
 * Pure vector extractor (no network): reads `response.embedding.values`
 * off the SDK response shape and rejects anything unusable.
 */
function extractValues(result) {
  const values = result && result.embedding && result.embedding.values;
  if (!Array.isArray(values) || values.length === 0) {
    throw codedError(
      'LLM_EMPTY_RESPONSE',
      'The embedding service returned no usable vector. Falling back to keyword retrieval.'
    );
  }
  if (values.length !== DIMENSIONS) {
    throw codedError(
      'LLM_EMPTY_RESPONSE',
      `The embedding service returned ${values.length} dimensions (expected ${DIMENSIONS}). Falling back to keyword retrieval.`
    );
  }
  return values.map((value) => Number(value));
}

/**
 * Core embedder. `taskType` tells Gemini how the text will be used
 * (documents and queries live in different embedding subspaces, so the
 * seed and the query path must not share a task type). `clientFactory`
 * is the test seam and defaults to the real SDK client.
 */
async function embed({ text, taskType, clientFactory } = {}) {
  if (!isConfigured()) {
    throw codedError(
      'LLM_NOT_CONFIGURED',
      'Embedding provider is not configured (set LLM_API_KEY). Falling back to keyword retrieval.'
    );
  }

  const trimmed = String(text === undefined || text === null ? '' : text).trim();
  if (!trimmed) {
    throw codedError(
      'LLM_EMPTY_RESPONSE',
      'Nothing to embed: empty text passed to the embedding service.'
    );
  }

  const factory = clientFactory || defaultClientFactory;
  const model = factory(process.env.LLM_API_KEY);

  // `outputDimensionality` is accepted by the API but missing from the
  // v0.24.1 typings (see the file header) — passed through as-is.
  const request = {
    content: { parts: [{ text: trimmed }] },
    taskType,
    outputDimensionality: DIMENSIONS,
  };

  let result;
  try {
    result = await Promise.race([
      model.embedContent(request),
      new Promise((_, reject) =>
        setTimeout(() => {
          reject(
            codedError(
              'LLM_NETWORK_ERROR',
              'The embedding service timed out. Falling back to keyword retrieval.'
            )
          );
        }, REQUEST_TIMEOUT_MS)
      ),
    ]);
  } catch (err) {
    if (err && err.code && String(err.code).startsWith('LLM_')) throw err;
    throw codedError(
      'LLM_NETWORK_ERROR',
      'The embedding service is unreachable. Falling back to keyword retrieval.'
    );
  }

  return extractValues(result);
}

/** Passage-side embedding — used when indexing knowledge_base rows. */
function embedDocument(text) {
  return embed({ text, taskType: 'RETRIEVAL_DOCUMENT' });
}

/** Query-side embedding — used by retrievalService.retrieveAsync(). */
function embedQuery(text) {
  return embed({ text, taskType: 'RETRIEVAL_QUERY' });
}

module.exports = {
  isConfigured,
  getModel,
  embed,
  embedDocument,
  embedQuery,
  DIMENSIONS,
};
