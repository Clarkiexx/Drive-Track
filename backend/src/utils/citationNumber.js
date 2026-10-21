// Shared Prisma data layer — src/lib/prisma.js is the single place the client
// is constructed.
const { prisma } = require('../lib/prisma');

const PREFIXES = {
  citation: 'CT',
  warning: 'WR',
  violation: 'VI',
};

/**
 * Generates a citation number like CT-2026-00142 — prefix depends on
 * record_type, sequence resets per year, zero-padded to 5 digits.
 *
 * The next sequence is the highest existing suffix + 1, NOT the row count.
 * A count breaks as soon as the register has gaps: with 11 citations whose
 * highest number is CT-2026-00016, count + 1 is CT-2026-00012 — already
 * taken — and every retry generates the same duplicate. This is especially
 * common with seeded/deleted/imported rows.
 *
 * Runs on PostgreSQL/Neon now, so the caller owns collision handling: a
 * duplicate INSERT raises P2002 and aborts the whole transaction, which means
 * the number must be regenerated OUTSIDE any open transaction (see the retry
 * loop in citationController.createCitation). `client` may be an interactive
 * transaction client when a caller wants the read to share its snapshot.
 */
async function generateCitationNumber(recordType, client = prisma) {
  const prefix = PREFIXES[recordType] || 'CT';
  const year = new Date().getFullYear();
  const base = `${prefix}-${year}-`;

  const rows = await client.citation.findMany({
    where: {
      // MySQL's LIKE was case-insensitive (default collation); keep the same
      // matching semantics on Postgres with mode: 'insensitive'.
      citationNumber: { startsWith: base, mode: 'insensitive' },
    },
    select: { citationNumber: true },
  });

  let highest = 0;
  for (const row of rows) {
    const suffix = row.citationNumber.slice(base.length);
    if (!/^\d+$/.test(suffix)) continue;

    const sequence = Number.parseInt(suffix, 10);
    if (Number.isInteger(sequence) && sequence > highest) highest = sequence;
  }

  return `${base}${String(highest + 1).padStart(5, '0')}`;
}

module.exports = { generateCitationNumber };
