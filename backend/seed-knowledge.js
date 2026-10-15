// One-time script that indexes the approved chat corpus into the pgvector
// `knowledge_base` table (Phase 2 RAG retrieval — Brain vs Library).
// Run once with: npx tsx seed-knowledge.js   (npm run seed:knowledge)
//
// Idempotent by design: the table is created with CREATE TABLE IF NOT EXISTS
// and rows are upserted by their stable passage id, so re-running is safe.
// It NEVER runs `prisma db push` / `migrate` (the live Neon database has
// known unrelated drift) — the only DDL is the repository's guarded
// CREATE TABLE IF NOT EXISTS.
//
// Each passage's approved answer text is embedded with gemini-embedding-001
// (768 dims, taskType RETRIEVAL_DOCUMENT). Only public, curated passage
// text leaves the server — no driver, citation, or fine data.

require('dotenv').config();

const { prisma } = require('./src/lib/prisma');
const { listPassages } = require('./src/services/chatKnowledge');
const embeddingService = require('./src/services/embeddingService');
const knowledgeRepository = require('./src/repositories/knowledgeRepository');

async function seed() {
  // Embedding needs a live Gemini call — refuse up front with a clear
  // message instead of dying halfway through the corpus.
  if (!process.env.LLM_API_KEY) {
    console.error(
      'seed:knowledge failed — LLM_API_KEY is not set in backend/.env.\n' +
        'The knowledge base needs Gemini embeddings (gemini-embedding-001, 768 dims).\n' +
        'Set LLM_API_KEY and re-run `npm run seed:knowledge`.'
    );
    process.exit(1);
  }

  await knowledgeRepository.ensureTable();
  console.log('knowledge_base table ensured (vector(768), pgvector).');

  const passages = listPassages();
  let indexed = 0;

  for (const passage of passages) {
    const embedding = await embeddingService.embedDocument(passage.text);

    await knowledgeRepository.upsertPassage({
      id: passage.id,
      question: passage.title,
      answer: passage.text,
      // Topics are the approved RAG categories (see chatKnowledge.js).
      category: (passage.topics && passage.topics[0]) || 'general',
      tags: passage.topics || [],
      // Source attribution for `sources[]`: authority + locator are read
      // back by retrievalService.retrieveAsync().
      metadata: {
        docId: passage.docId,
        title: passage.title,
        authority: passage.authority,
        docType: passage.docType,
        locator: passage.locator,
        topics: passage.topics,
        keywords: passage.keywords,
      },
      embedding,
    });

    indexed += 1;
    console.log(`Indexed ${indexed}/${passages.length}: ${passage.id} — ${passage.title}`);
  }

  console.log(
    `Knowledge base seeded: ${indexed} passages embedded with ` +
      `${embeddingService.getModel()} (${embeddingService.DIMENSIONS} dims).`
  );

  await prisma.$disconnect();
}

seed().catch(async (err) => {
  const detail = err && err.code ? `[${err.code}] ${err.message}` : err;
  console.error('Seeding failed:', detail);
  try {
    await prisma.$disconnect();
  } catch {
    // Nothing left to do — the process is exiting non-zero anyway.
  }
  process.exit(1);
});
