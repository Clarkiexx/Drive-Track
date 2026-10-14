// ---------------------------------------------------------------------------
// Shared Prisma foundation — the ONLY place the Prisma client is constructed.
// Every lane (auth/drivers/enforcers, citations, admin, reports...) imports
// `prisma` and the error/date helpers from here so behavior stays uniform.
//
// Runtime notes:
//  - Backend runs under `tsx` (`npm start` / `npm run dev`), which resolves
//    the `@/*` tsconfig path and loads the generated TypeScript client at
//    src/generated/prisma/client.ts. Plain `node server.js` cannot (that
//    client ships ESM `import.meta` + .ts files), hence the tsx scripts.
//  - DATABASE_URL is the POOLED Neon endpoint (runtime). prisma.config.ts
//    uses DATABASE_URL_UNPOOLED only for `prisma db push` / CLI.
//  - The client is cached on globalThis so `tsx watch` reloads don't leak
//    one connection pool per restart.
// ---------------------------------------------------------------------------

const { PrismaClient } = require('@/generated/prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');

if (!process.env.DATABASE_URL) {
  throw new Error(
    'DATABASE_URL is not set — run `dotenv` first (server.js / seed scripts do) and check backend/.env'
  );
}

let prisma = globalThis.__drivetrackPrisma;
if (!prisma) {
  prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  globalThis.__drivetrackPrisma = prisma;
}

/**
 * Maps a Prisma error onto the same HTTP contract the old Sequelize handler
 * produced, so controllers can answer with the exact bodies clients expect:
 *
 *   P2002 (unique violation) -> 409 "A record with this value already exists"
 *   P2025 (record not found) -> 404
 *   Prisma validation / P2023 (bad column data, e.g. malformed date) -> 422
 *   anything else            -> 500 "Internal server error" (logged, not leaked)
 *
 * Returns `{ status, message, errors }` for use with fail(res, ...).
 * Controllers that own a more specific message (e.g. the driver full-name
 * clash) override `message` after calling this.
 */
function prismaErrorToHttp(err) {
  const code = err && typeof err.code === 'string' ? err.code : null;
  const name = err && err.name;

  if (code === 'P2002') {
    const target = err.meta && err.meta.target;
    const fields = Array.isArray(target) ? target.join(', ') : target;
    return {
      status: 409,
      message: 'A record with this value already exists',
      errors: fields ? [`Duplicate value for: ${fields}`] : null,
    };
  }

  if (code === 'P2025') {
    return { status: 404, message: 'Resource not found', errors: null };
  }

  if (name === 'PrismaClientValidationError' || code === 'P2023') {
    // Validation / value-conversion failures map onto the old
    // SequelizeValidationError branch (422 "Validation failed").
    // Prisma's message can quote raw query params, so it is logged upstream
    // rather than echoed back to the client. The terminal log below is the
    // diagnostic trail: it names the rejecting field/value during testing.
    // eslint-disable-next-line no-console
    console.warn(`[prisma] value rejected (${code || name}):`, err.message);
    return { status: 422, message: 'Validation failed', errors: null };
  }

  return { status: 500, message: 'Internal server error', errors: null };
}

/**
 * Formats a `@db.Date` value (DateTime at midnight) as `YYYY-MM-DD` — the
 * exact wire format Sequelize DATEONLY produced on MySQL, so date-only
 * fields keep round-tripping identically. Strings pass through, null stays
 * null.
 */
function toDateOnlyString(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value.slice(0, 10);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

/**
 * Money / precision fields are Prisma Decimal instances. They already
 * serialize to the same strings MySQL sent back, but when a number is
 * genuinely required (sums, totals) convert once — never via float math
 * on the Decimal itself.
 */
function toNumber(value) {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return value;
  const n = Number(value.toString());
  return Number.isFinite(n) ? n : 0;
}

module.exports = { prisma, prismaErrorToHttp, toDateOnlyString, toNumber };
