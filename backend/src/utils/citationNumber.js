// Shared Prisma data layer — src/lib/prisma.js is the single place the client
// and the error/date/number helpers come from (owned by the foundation lane).
const { prisma, prismaErrorToHttp, toDateOnlyString, toNumber } = require('../lib/prisma');

const PREFIXES = {
  citation: 'CT',
  warning: 'WR',
  violation: 'VI',
};

/**
 * Generates a citation number like CT-2026-00142 — prefix depends on
 * record_type, sequence resets per year, zero-padded to 5 digits.
 * Counts existing records of the same type/year rather than using a
 * separate counter table — simple and sufficient for this scale.
 *
 * Runs on PostgreSQL/Neon now, so the caller owns collision handling: a
 * duplicate INSERT raises P2002 and aborts the whole transaction, which means
 * the number must be regenerated OUTSIDE any open transaction (see the retry
 * loop in citationController.createCitation). `client` may be an interactive
 * transaction client when a caller wants the count to share its snapshot.
 */
async function generateCitationNumber(recordType, client = prisma) {
  const prefix = PREFIXES[recordType] || 'CT';
  const year = new Date().getFullYear();

  const count = await client.citation.count({
    where: {
      // MySQL's LIKE was case-insensitive (default collation); keep the same
      // matching semantics on Postgres with mode: 'insensitive'.
      citationNumber: { startsWith: `${prefix}-${year}-`, mode: 'insensitive' },
    },
  });

  const sequence = String(count + 1).padStart(5, '0');
  return `${prefix}-${year}-${sequence}`;
}

module.exports = { generateCitationNumber };
