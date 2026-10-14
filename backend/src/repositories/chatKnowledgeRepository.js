/**
 * Chat knowledge repository — data-access layer for RAG passages.
 *
 * Mirrors the repository pattern (data access isolated from retrieval
 * logic): callers use listActivePassages() and never care where rows live.
 *
 * Phase 1: rows come from services/chatKnowledge.js (the approved in-code
 * corpus — no migration, no new tables). When CTMO-approved documents are
 * indexed in future (separate proposal), this module becomes the Prisma
 * reader over `chat_documents`/`chat_chunks` filtered to approved,
 * in-jurisdiction, currently-effective rows — retrievalService.js will not
 * change, because the passage shape is already the contract.
 */

const { listPassages } = require('../services/chatKnowledge');

function listActivePassages() {
  // Future DB-backed version: `where: { approvalStatus: 'approved', ... }`.
  return listPassages();
}

module.exports = { listActivePassages };
