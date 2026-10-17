// One-time script that loads the bundled Learning Center catalogue into the
// admin-managed `learning_signs` + `learning_quiz_questions` tables.
// Run once with: npx tsx seed-learning.js   (npm run seed:learning)
//
// The bundled catalogue (frontend/data/trafficSigns.ts — the offline
// fallback the driver UI still ships with) is the seed source: all signs and
// quiz questions are read from it directly under tsx and inserted with
// their stable ids, so quiz `signId` references line up exactly.
//
// Idempotent by design: rows that already exist are left untouched — after
// the first seed the ADMIN owns the content, and re-running must never
// clobber edits or resurrect an archived sign.
//
// It NEVER runs `prisma db push` / `migrate` (the live Neon database has
// known unrelated drift) — the only DDL is learningRepository's guarded
// CREATE TABLE IF NOT EXISTS.

require('dotenv').config();

const { prisma } = require('./src/lib/prisma');
const learningRepository = require('./src/repositories/learningRepository');
const { trafficSigns, quizQuestions } = require('../frontend/data/trafficSigns');

async function seed() {
  await learningRepository.ensureTables();

  let signsCreated = 0;
  let signsKept = 0;
  for (const [index, sign] of trafficSigns.entries()) {
    // eslint-disable-next-line no-await-in-loop
    const existing = await prisma.learningSign.findUnique({ where: { id: sign.id } });
    if (existing) {
      signsKept += 1;
      continue;
    }
    // eslint-disable-next-line no-await-in-loop
    await prisma.learningSign.create({
      data: {
        id: sign.id,
        name: sign.name,
        category: sign.category,
        shape: sign.shape,
        color: sign.color,
        meaning: sign.meaning,
        glyph: sign.glyph,
        prohibited: sign.prohibited ?? false,
        solid: sign.solid ?? false,
        // Keep the curated file order as the admin-visible default order.
        sortOrder: index,
        isActive: true,
      },
    });
    signsCreated += 1;
  }
  console.log(`Signs: ${signsCreated} created, ${signsKept} already present`);

  const signIds = new Set(trafficSigns.map((sign) => sign.id));
  let questionsCreated = 0;
  let questionsKept = 0;
  for (const question of quizQuestions) {
    if (!signIds.has(question.signId)) {
      throw new Error(
        `Quiz question ${question.id} references unknown sign "${question.signId}"`
      );
    }
    // eslint-disable-next-line no-await-in-loop
    const existing = await prisma.learningQuizQuestion.findUnique({
      where: { id: question.id },
    });
    if (existing) {
      questionsKept += 1;
      continue;
    }
    // eslint-disable-next-line no-await-in-loop
    await prisma.learningQuizQuestion.create({
      data: {
        id: question.id,
        signId: question.signId,
        question: question.question,
        options: question.options,
        correctIndex: question.correctIndex,
        isActive: true,
      },
    });
    questionsCreated += 1;
  }
  console.log(`Quiz questions: ${questionsCreated} created, ${questionsKept} already present`);

  await prisma.$disconnect();
}

seed().catch((err) => {
  console.error('Seeding failed:', err);
  process.exit(1);
});
