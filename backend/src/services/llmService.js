/**
 * LLM service — Google Gemini-backed RAG generation.
 *
 * Client: the official `@google/generative-ai` SDK (per the approved
 * reference implementation), default model `gemini-2.5-flash`. Credentials
 * live in backend env only (`LLM_API_KEY`); the client is constructed
 * per call from the env value — never stored, never logged, never
 * returned, and never sent to the frontend.
 *
 * Hard rules (mirror the Phase 1 approval):
 *  - buildChatPrompt() is pure and takes ONLY { question, passages }.
 *    Personal citation records, driver information, and fine details MUST
 *    NOT be added to prompts — enforcement is structural: there is simply
 *    no parameter for them.
 *  - Stateless: prompts and completions are never logged or stored.
 *  - Quota guard: in-memory per-caller rolling throttle (memory only,
 *    restarts clear it — not chat retention). Over-limit callers degrade
 *    to curated passages instead of erroring.
 *  - Every failure mode (unconfigured, network, block, empty) throws a
 *    coded error the controller turns into a curated-passage fallback —
 *    a chat answer falls back, it never 500s.
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');

const PROVIDER = process.env.LLM_PROVIDER || 'gemini';
const MODEL = process.env.LLM_MODEL || 'gemini-2.5-flash';
const REQUEST_TIMEOUT_MS = 20000;
const MAX_OUTPUT_TOKENS = 512;

// Quota guard: at most this many live generations per caller per hour.
const THROTTLE_LIMIT = 20;
const THROTTLE_WINDOW_MS = 60 * 60 * 1000;
const throttleMarks = new Map();

function isConfigured() {
  return Boolean(process.env.LLM_API_KEY);
}

function getProvider() {
  return PROVIDER;
}

function getModel() {
  return MODEL;
}

function checkThrottle(key) {
  if (!key) return;
  const now = Date.now();
  const marks = (throttleMarks.get(key) || []).filter((t) => now - t < THROTTLE_WINDOW_MS);
  if (marks.length >= THROTTLE_LIMIT) {
    const err = new Error('Generation quota reached. Answering from approved passages instead.');
    err.code = 'LLM_RATE_LIMITED';
    throw err;
  }
  marks.push(now);
  throttleMarks.set(key, marks);
  if (throttleMarks.size > 10000) throttleMarks.clear();
}

/**
 * Pure prompt builder (no network, no secrets, no PII beyond the driver's
 * own question text). Grounding contract mirrors the reference persona
 * pattern, adapted to CTMO: answer ONLY from the passages, cite them,
 * refuse when they are insufficient, and never invent regulations,
 * ordinance numbers, fines, penalties, or office policies.
 */
function buildChatPrompt({ question, passages }) {
  const context = (passages || [])
    .map((entry, index) => {
      const passage = entry.passage || entry;
      const title = passage.title || 'Untitled';
      const authority = passage.authority || 'CTMO';
      const locator = passage.locator || '';
      return `[${index + 1}] (${authority} — ${title}${locator ? `, ${locator}` : ''})\n${passage.text || ''}`;
    })
    .join('\n\n');

  return {
    system:
      'You are the DriveTrack Assistant for the City Traffic Management Office. ' +
      'Answer the driver ONLY from the approved passages below. ' +
      'Cite the passage numbers you used (e.g. [1]). ' +
      'If the passages do not contain the answer, say the question is not ' +
      'covered in the official guides and direct the driver to contact ' +
      'the CTMO directly (office contact details are in the office ' +
      'passages when present) — do not guess. ' +
      'Never invent traffic regulations, ordinance numbers, fines, penalties, or office policies. ' +
      'Never state fine amounts unless they appear verbatim in the passages.',
    user: `Approved passages:\n${context}\n\nDriver question: ${question}`,
  };
}

/**
 * Pure model-text extractor (no network): reads the SDK response shape,
 * or throws LLM_EMPTY_RESPONSE (safety blocks and empty candidates
 * degrade to curated passages upstream).
 */
function extractModelText(result) {
  let text = '';
  try {
    text = (result && result.response && typeof result.response.text === 'function'
      ? result.response.text()
      : '');
  } catch {
    text = '';
  }
  if (!text || !text.trim()) {
    const err = new Error('The model returned no usable answer. Answering from approved passages instead.');
    err.code = 'LLM_EMPTY_RESPONSE';
    throw err;
  }
  return text.trim();
}

/**
 * Default client factory (seam for stubbed verification — tests inject a
 * fake factory so no network or quota is ever spent).
 */
function defaultClientFactory(apiKey) {
  const client = new GoogleGenerativeAI(apiKey);
  // systemInstruction travels per request (it varies with the passages).
  return client.getGenerativeModel({ model: MODEL });
}

/**
 * Grounded generation entry point. `key` identifies the caller for the
 * quota guard (e.g. 'driver:<id>'); omit it only where throttling the
 * caller is meaningless (tests). `clientFactory` is the test seam and
 * defaults to the real SDK client.
 */
async function generate({ question, passages, key, clientFactory } = {}) {
  if (!isConfigured()) {
    const err = new Error(
      'LLM provider is not configured (set LLM_API_KEY). Falling back to curated passages.'
    );
    err.code = 'LLM_NOT_CONFIGURED';
    throw err;
  }
  if (PROVIDER !== 'gemini') {
    const err = new Error(
      `LLM provider client for "${PROVIDER}" is not implemented yet. Falling back to curated passages.`
    );
    err.code = 'LLM_PROVIDER_UNSUPPORTED';
    throw err;
  }

  checkThrottle(key);

  const prompt = buildChatPrompt({ question, passages });
  const factory = clientFactory || defaultClientFactory;
  const model = factory(process.env.LLM_API_KEY);

  let result;
  try {
    result = await Promise.race([
      model.generateContent({
        systemInstruction: prompt.system,
        contents: [{ role: 'user', parts: [{ text: prompt.user }] }],
        generationConfig: { temperature: 0, maxOutputTokens: MAX_OUTPUT_TOKENS },
      }),
      new Promise((_, reject) =>
        setTimeout(() => {
          const err = new Error('The assistant service timed out. Answering from approved passages instead.');
          err.code = 'LLM_NETWORK_ERROR';
          reject(err);
        }, REQUEST_TIMEOUT_MS)
      ),
    ]);
  } catch (err) {
    if (err && err.code && String(err.code).startsWith('LLM_')) throw err;
    const net = new Error('The assistant service is unreachable. Answering from approved passages instead.');
    net.code = 'LLM_NETWORK_ERROR';
    throw net;
  }

  return { answer: extractModelText(result) };
}

module.exports = {
  isConfigured,
  getProvider,
  getModel,
  buildChatPrompt,
  extractModelText,
  generate,
};
