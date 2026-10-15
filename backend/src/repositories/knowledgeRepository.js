/**
 * Knowledge repository — data access for the pgvector RAG knowledge base
 * (`knowledge_base`, vector(768) — see prisma/schema.prisma KnowledgeBase).
 *
 * The table is created here with `CREATE TABLE IF NOT EXISTS` (never via
 * `prisma db push` / `migrate`: the live Neon database has known unrelated
 * drift and is off-limits to migration tooling). `npx prisma generate`
 * only — the model in the schema exists for typing, not for DDL.
 *
 * No ANN index is created on purpose: the approved corpus is a handful of
 * rows, so a sequential scan with the <=> operator is both correct and
 * fast. Add an HNSW/IVFFlat index only if the corpus ever grows large.
 *
 * Parameters are always bound (`$1`, `$2`, ...), never interpolated —
 * pgvector text literals (`'[1,2,...]'::vector`, `'{"a","b"}'::text[]`)
 * are built from values and passed as bound strings.
 */

const { prisma } = require('../lib/prisma');

const CREATE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS knowledge_base (
  id TEXT PRIMARY KEY,
  question TEXT,
  answer TEXT,
  category TEXT,
  tags TEXT[],
  metadata JSONB,
  embedding vector(768),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
)`;

/**
 * Idempotent schema guard. Safe to call on every seed/run: an existing
 * table (or an existing pgvector extension) is left untouched.
 */
async function ensureTable() {
  await prisma.$executeRawUnsafe(CREATE_TABLE_SQL);
}

/**
 * Renders a JS string array as a Postgres array literal
 * (`{"a","b"}`) with backslash/quote escaping, so `tags` can be bound as
 * a parameter and cast with `::text[]` instead of being interpolated.
 */
function toTextArrayLiteral(values) {
  const items = (Array.isArray(values) ? values : []).map((value) =>
    `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
  );
  return `{${items.join(',')}}`;
}

/**
 * Inserts or refreshes one passage (keyed by its stable `id`).
 * `embedding` is the 768-float array from embeddingService; it is
 * JSON-stringified and cast `::vector` (the wire format pgvector parses).
 */
async function upsertPassage({ id, question, answer, category, tags, metadata, embedding }) {
  if (!id) {
    const err = new Error('knowledge_base upsert requires a passage id');
    err.code = 'KNOWLEDGE_INVALID_PASSAGE';
    throw err;
  }

  const vectorLiteral = JSON.stringify(embedding);
  const tagsLiteral = toTextArrayLiteral(tags);
  const metadataLiteral = JSON.stringify(metadata || {});

  await prisma.$executeRawUnsafe(
    `INSERT INTO knowledge_base
       (id, question, answer, category, tags, metadata, embedding, is_active, created_at, updated_at)
     VALUES
       ($1, $2, $3, $4, $5::text[], $6::jsonb, $7::vector, TRUE, now(), now())
     ON CONFLICT (id) DO UPDATE SET
       question = EXCLUDED.question,
       answer = EXCLUDED.answer,
       category = EXCLUDED.category,
       tags = EXCLUDED.tags,
       metadata = EXCLUDED.metadata,
       embedding = EXCLUDED.embedding,
       is_active = TRUE,
       updated_at = now()`,
    id,
    question || null,
    answer || null,
    category || null,
    tagsLiteral,
    metadataLiteral,
    vectorLiteral
  );
}

/**
 * Cosine distance search over active passages, nearest first.
 * Returns raw rows including `distance` (0 = identical direction); the
 * retrieval service turns it into a score with `1 - distance`.
 * Sequential scan by design — see the file header.
 */
async function vectorSearch(queryVector, limit = 3) {
  const vectorLiteral = JSON.stringify(queryVector);
  const safeLimit = Number.isInteger(limit) && limit > 0 ? limit : 3;

  const rows = await prisma.$queryRawUnsafe(
    `SELECT id,
            question,
            answer,
            category,
            tags,
            metadata,
            is_active,
            created_at,
            updated_at,
            embedding <=> $1::vector AS distance
       FROM knowledge_base
      WHERE is_active = TRUE
      ORDER BY embedding <=> $1::vector
      LIMIT $2`,
    vectorLiteral,
    safeLimit
  );

  return Array.isArray(rows) ? rows : [];
}

module.exports = {
  ensureTable,
  upsertPassage,
  vectorSearch,
  CREATE_TABLE_SQL,
};
