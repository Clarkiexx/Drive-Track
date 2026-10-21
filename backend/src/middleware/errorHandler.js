const { fail } = require('../utils/response');
const { prismaErrorToHttp } = require('../lib/prisma');

/**
 * Foreign-key (P2003) detail — the one Prisma code the shared mapper does
 * not model (it reports 500 for it), so this handler keeps its historical
 * 422 body here. Every other Prisma code is delegated to `prismaErrorToHttp`
 * below, which is the same helper the controllers call inline, so both paths
 * answer with the same status/message/envelope and the same `errors[]` text.
 */
function prismaFieldErrors(err) {
  const meta = err.meta || {};
  const raw = meta.field !== undefined ? meta.field : meta.target;
  if (raw === null || raw === undefined) return null;
  return Array.isArray(raw) ? raw.map(String) : [String(raw)];
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  console.error(err);

  if (err.name === 'SequelizeUniqueConstraintError') {
    return fail(res, 'A record with this value already exists', 409, err.errors?.map(e => e.message));
  }

  if (err.name === 'SequelizeValidationError') {
    return fail(res, 'Validation failed', 422, err.errors?.map(e => e.message));
  }

  // Prisma (Neon) errors — ONE shared mapping (src/lib/prisma.js), so the
  // status/message/envelope AND the `errors[]` detail text are identical
  // whether a controller answered inline through `prismaErrorToHttp` or the
  // error reached this handler: P2002 -> 409 "A record with this value
  // already exists" + `Duplicate value for: <columns>`, P2025 -> 404
  // "Resource not found", Prisma validation/P2023 -> 422 "Validation failed";
  // any other Prisma code (P1001 connection, P2021 missing table, ...) maps
  // to the shared 500 "Internal server error". The Sequelize branches above
  // stay as harmless dead code until Phase D.
  const prismaCode = typeof err.code === 'string' && /^P\d{4}$/.test(err.code);
  if (prismaCode || err.name === 'PrismaClientValidationError') {
    if (err.code === 'P2003') {
      // Schema FKs are Cascade/SetNull, so a P2003 means the request
      // referenced a row that does not exist (or is still referenced):
      // a client input problem -> 422, reusing the existing 422 body.
      return fail(res, 'Validation failed', 422, prismaFieldErrors(err));
    }
    const mapped = prismaErrorToHttp(err);
    return fail(res, mapped.message, mapped.status, mapped.errors);
  }

  // Multer upload failures (thrown before controllers run): surface them
  // with useful client-facing codes instead of a generic 500.
  if (err.name === 'MulterError') {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return fail(res, 'Uploaded file is too large. Maximum is 8MB per photo.', 413);
    }
    if (err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE') {
      return fail(res, 'Too many files. Up to 5 evidence photos are allowed.', 422);
    }
    return fail(res, 'File upload failed', 422);
  }
  if (err.message === 'Only JPEG, PNG, or WEBP images are allowed') {
    return fail(res, err.message, 422);
  }

  // Never leak raw implementation details (SQL, stack traces, driver
  // messages) to API clients — log them server-side and return a generic
  // message instead. Known fail() responses already carry safe messages.
  const statusCode = err.statusCode || err.status || 500;
  if (statusCode >= 500) {
    // Errors that explicitly opt into a safe client-facing message (e.g. the
    // Cloudinary storage helpers' 502s) keep it; everything else stays opaque.
    if (err.publicMessage) {
      return fail(res, err.publicMessage, statusCode);
    }
    return fail(res, 'Internal server error', 500);
  }
  return fail(res, 'Request failed', statusCode);
}

module.exports = errorHandler;
