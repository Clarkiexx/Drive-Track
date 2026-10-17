/**
 * Learning repository — DDL for the admin-managed Learning Center
 * (`learning_signs` + `learning_quiz_questions` — see prisma/schema.prisma
 * LearningSign / LearningQuizQuestion).
 *
 * The tables are created here with `CREATE TABLE IF NOT EXISTS` (never via
 * `prisma db push` / `migrate`: the live Neon database has known unrelated
 * drift and is off-limits to migration tooling) — the same contract as
 * knowledgeRepository. `npx prisma generate` only: the models in the schema
 * exist for typing, not for DDL.
 *
 * Row reads/writes go through the generated Prisma client everywhere else;
 * this module is the single place the raw table shapes live. `ensureTables()`
 * is memoized, so it is safe (and cheap) to call on every request path —
 * the first call issues the guarded DDL, later calls resolve the same
 * promise.
 */

const { prisma } = require('../lib/prisma');

const CREATE_SIGNS_SQL = `
CREATE TABLE IF NOT EXISTS learning_signs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  shape TEXT NOT NULL,
  color TEXT NOT NULL,
  meaning TEXT NOT NULL,
  glyph TEXT NOT NULL,
  prohibited BOOLEAN NOT NULL DEFAULT FALSE,
  solid BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT now()
)`;

const CREATE_QUIZ_SQL = `
CREATE TABLE IF NOT EXISTS learning_quiz_questions (
  id TEXT PRIMARY KEY,
  sign_id TEXT NOT NULL REFERENCES learning_signs(id),
  question TEXT NOT NULL,
  options TEXT[] NOT NULL,
  correct_index INTEGER NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT now()
)`;

/** Memoized guard — signs first (the quiz table references it). */
let ensurePromise = null;

function ensureTables() {
  if (!ensurePromise) {
    ensurePromise = (async () => {
      await prisma.$executeRawUnsafe(CREATE_SIGNS_SQL);
      await prisma.$executeRawUnsafe(CREATE_QUIZ_SQL);
    })().catch((err) => {
      // Don't cache a failure: a transient DB error must not poison every
      // later request. The next caller retries the guarded DDL.
      ensurePromise = null;
      throw err;
    });
  }
  return ensurePromise;
}

module.exports = {
  ensureTables,
  CREATE_SIGNS_SQL,
  CREATE_QUIZ_SQL,
};
