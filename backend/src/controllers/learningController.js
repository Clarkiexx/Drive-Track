const crypto = require('node:crypto');
const { validationResult } = require('express-validator');
const { success, fail } = require('../utils/response');
const { logAdminAction } = require('../services/auditLogService');
const { prisma } = require('../lib/prisma');
const learningRepository = require('../repositories/learningRepository');

/**
 * Learning Center management — the road-sign catalogue and quiz questions
 * the driver Learning Center + Quiz read. Read routes are open to every
 * logged-in role; every mutation is admin-only (enforced in the routes).
 *
 * Habits borrowed from violationTypeController:
 *  - deactivate, never hard-delete (history and quizzes keep their row);
 *  - every mutation writes an audit-log entry, fire-and-forget;
 *  - validation failures answer 422 through the shared envelope.
 */

function handleValidation(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    fail(res, 'Validation failed', 422, errors.array());
    return false;
  }
  return true;
}

/**
 * Stable, readable id for admin-created signs: the name slugified
 * ("No Left Turn" → "no-left-turn"). Seeded signs keep their bundled ids
 * (see seed-learning.js), so nothing ever needs to rewrite them.
 */
function slugify(name) {
  const slug = String(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return slug || 'sign';
}

/** First free `${base}`, `${base}-2`, `${base}-3`, ... */
async function uniqueSignId(base) {
  let candidate = base;
  let suffix = 1;
  // Bounded so a pathological state can't loop forever; 1000 collisions on
  // one slug name is not a real scenario.
  while (suffix <= 1000) {
    const existing = await prisma.learningSign.findUnique({ where: { id: candidate } });
    if (!existing) return candidate;
    suffix += 1;
    candidate = `${base}-${suffix}`;
  }
  throw new Error(`Unable to allocate a learning sign id for "${base}"`);
}

/** GET /learning/signs?active=true — any logged-in role. */
async function listSigns(req, res, next) {
  try {
    await learningRepository.ensureTables();

    const where = {};
    if (req.query.active === 'true') where.isActive = true;

    const signs = await prisma.learningSign.findMany({
      where,
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });

    return success(res, signs);
  } catch (err) {
    next(err);
  }
}

/** POST /learning/signs — admin only. */
async function createSign(req, res, next) {
  try {
    if (!handleValidation(req, res)) return;
    await learningRepository.ensureTables();

    const { name, category, shape, color, meaning, glyph, prohibited, solid, sortOrder } =
      req.body;

    const base = slugify(name);
    let sign = null;
    // The unique-id scan and the insert are not atomic; a racing create can
    // still trip P2002 on the primary key — one retry picks a fresh suffix.
    for (let attempt = 0; attempt < 2 && !sign; attempt += 1) {
      const id = attempt === 0 ? await uniqueSignId(base) : await uniqueSignId(`${base}-2`);
      try {
        sign = await prisma.learningSign.create({
          data: {
            id,
            name,
            category,
            shape,
            color,
            meaning,
            glyph,
            prohibited: prohibited ?? false,
            solid: solid ?? false,
            sortOrder: sortOrder ?? 0,
            isActive: true,
          },
        });
      } catch (err) {
        if (err?.code !== 'P2002') throw err;
      }
    }
    if (!sign) return fail(res, 'Unable to allocate a learning sign id', 409);

    // audit_logs.target_id is an Int column (the table predates text ids) —
    // the slug travels in `details` instead so the entry still names the row.
    logAdminAction(
      req.user.id,
      'created_learning_sign',
      'learning_sign',
      null,
      `${sign.name} (${sign.id})`
    );
    return success(res, sign, 'Learning sign created', 201);
  } catch (err) {
    next(err);
  }
}

/** PATCH /learning/signs/:id — admin only, partial update. */
async function updateSign(req, res, next) {
  try {
    if (!handleValidation(req, res)) return;
    await learningRepository.ensureTables();

    const existing = await prisma.learningSign.findUnique({ where: { id: req.params.id } });
    if (!existing) return fail(res, 'Learning sign not found', 404);

    const { name, category, shape, color, meaning, glyph, prohibited, solid, sortOrder } =
      req.body;
    const data = {};
    if (name !== undefined) data.name = name;
    if (category !== undefined) data.category = category;
    if (shape !== undefined) data.shape = shape;
    if (color !== undefined) data.color = color;
    if (meaning !== undefined) data.meaning = meaning;
    if (glyph !== undefined) data.glyph = glyph;
    if (prohibited !== undefined) data.prohibited = prohibited;
    if (solid !== undefined) data.solid = solid;
    if (sortOrder !== undefined) data.sortOrder = sortOrder;

    // Mirror the violation-types behaviour: an empty patch is a no-op read,
    // not an empty UPDATE.
    const sign =
      Object.keys(data).length > 0
        ? await prisma.learningSign.update({ where: { id: existing.id }, data })
        : existing;

    logAdminAction(
      req.user.id,
      'updated_learning_sign',
      'learning_sign',
      null,
      `${sign.name} (${sign.id})`
    );
    return success(res, sign, 'Learning sign updated');
  } catch (err) {
    next(err);
  }
}

/** PATCH /learning/signs/:id/status — activate/deactivate, never hard-delete. */
async function updateSignStatus(req, res, next) {
  try {
    await learningRepository.ensureTables();

    const { isActive } = req.body;
    if (typeof isActive !== 'boolean') {
      return fail(res, 'isActive must be true or false', 422);
    }

    const existing = await prisma.learningSign.findUnique({ where: { id: req.params.id } });
    if (!existing) return fail(res, 'Learning sign not found', 404);

    const sign = await prisma.learningSign.update({
      where: { id: existing.id },
      data: { isActive },
    });

    logAdminAction(
      req.user.id,
      isActive ? 'activated_learning_sign' : 'deactivated_learning_sign',
      'learning_sign',
      null,
      `${sign.name} (${sign.id})`
    );
    return success(res, sign, isActive ? 'Learning sign activated' : 'Learning sign deactivated');
  } catch (err) {
    next(err);
  }
}

/**
 * GET /learning/quiz?active=true — any logged-in role.
 * Each question carries its `sign` object (drivers render the plate from
 * it). With ?active=true the list narrows to active questions whose sign
 * is also active, so archiving a sign hides its questions with it.
 */
async function listQuiz(req, res, next) {
  try {
    await learningRepository.ensureTables();

    const where = {};
    if (req.query.active === 'true') where.isActive = true;

    const questions = await prisma.learningQuizQuestion.findMany({
      where,
      orderBy: { createdAt: 'asc' },
    });

    const signIds = [...new Set(questions.map((question) => question.signId))];
    const signs = signIds.length
      ? await prisma.learningSign.findMany({ where: { id: { in: signIds } } })
      : [];
    const signById = new Map(signs.map((sign) => [sign.id, sign]));

    let rows = questions.map((question) => ({
      ...question,
      sign: signById.get(question.signId) ?? null,
    }));
    if (req.query.active === 'true') {
      rows = rows.filter((row) => row.sign && row.sign.isActive);
    }

    return success(res, rows);
  } catch (err) {
    next(err);
  }
}

/** POST /learning/quiz — admin only. */
async function createQuizQuestion(req, res, next) {
  try {
    if (!handleValidation(req, res)) return;
    await learningRepository.ensureTables();

    const { signId, question, options, correctIndex } = req.body;

    const sign = await prisma.learningSign.findUnique({ where: { id: signId } });
    if (!sign) return fail(res, 'The referenced learning sign does not exist', 422);

    const created = await prisma.learningQuizQuestion.create({
      data: {
        id: crypto.randomUUID(),
        signId,
        question,
        options,
        correctIndex,
        isActive: true,
      },
    });

    logAdminAction(
      req.user.id,
      'created_learning_quiz',
      'learning_quiz',
      null,
      `Sign ${created.signId}: ${created.question}`.slice(0, 240)
    );
    return success(res, { ...created, sign }, 'Quiz question created', 201);
  } catch (err) {
    next(err);
  }
}

/** PATCH /learning/quiz/:id — admin only, partial update. */
async function updateQuizQuestion(req, res, next) {
  try {
    if (!handleValidation(req, res)) return;
    await learningRepository.ensureTables();

    const existing = await prisma.learningQuizQuestion.findUnique({
      where: { id: req.params.id },
    });
    if (!existing) return fail(res, 'Quiz question not found', 404);

    const { signId, question, options, correctIndex } = req.body;
    const data = {};
    if (signId !== undefined) {
      const sign = await prisma.learningSign.findUnique({ where: { id: signId } });
      if (!sign) return fail(res, 'The referenced learning sign does not exist', 422);
      data.signId = signId;
    }
    if (question !== undefined) data.question = question;
    if (options !== undefined) data.options = options;
    if (correctIndex !== undefined) data.correctIndex = correctIndex;

    const updated =
      Object.keys(data).length > 0
        ? await prisma.learningQuizQuestion.update({ where: { id: existing.id }, data })
        : existing;

    logAdminAction(
      req.user.id,
      'updated_learning_quiz',
      'learning_quiz',
      null,
      `Sign ${updated.signId}: ${updated.question}`.slice(0, 240)
    );

    const sign = await prisma.learningSign.findUnique({ where: { id: updated.signId } });
    return success(res, { ...updated, sign: sign ?? null }, 'Quiz question updated');
  } catch (err) {
    next(err);
  }
}

/** PATCH /learning/quiz/:id/status — activate/deactivate, never hard-delete. */
async function updateQuizQuestionStatus(req, res, next) {
  try {
    await learningRepository.ensureTables();

    const { isActive } = req.body;
    if (typeof isActive !== 'boolean') {
      return fail(res, 'isActive must be true or false', 422);
    }

    const existing = await prisma.learningQuizQuestion.findUnique({
      where: { id: req.params.id },
    });
    if (!existing) return fail(res, 'Quiz question not found', 404);

    const updated = await prisma.learningQuizQuestion.update({
      where: { id: existing.id },
      data: { isActive },
    });

    logAdminAction(
      req.user.id,
      isActive ? 'activated_learning_quiz' : 'deactivated_learning_quiz',
      'learning_quiz',
      null,
      `Sign ${updated.signId}: ${updated.question}`.slice(0, 240)
    );
    return success(
      res,
      updated,
      isActive ? 'Quiz question activated' : 'Quiz question deactivated'
    );
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listSigns,
  createSign,
  updateSign,
  updateSignStatus,
  listQuiz,
  createQuizQuestion,
  updateQuizQuestion,
  updateQuizQuestionStatus,
};
