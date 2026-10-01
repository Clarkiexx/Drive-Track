const { Citation } = require('../models');
const { Op } = require('sequelize');

const PREFIXES = {
  citation: 'CT',
  warning: 'WR',
  violation: 'VI',
};

/**
 * Generates a citation number like CT-2026-00142 — prefix depends on
 * record_type, sequence resets per year, zero-padded to 5 digits.
 * Counts existing records of the same type/year rather than using a
 * separate counter table — simple and sufficient for this scale; a real
 * high-concurrency system would want a DB-level sequence to avoid any
 * race condition between simultaneous submissions.
 */
async function generateCitationNumber(recordType) {
  const prefix = PREFIXES[recordType] || 'CT';
  const year = new Date().getFullYear();

  const count = await Citation.count({
    where: {
      citationNumber: { [Op.like]: `${prefix}-${year}-%` },
    },
  });

  const sequence = String(count + 1).padStart(5, '0');
  return `${prefix}-${year}-${sequence}`;
}

module.exports = { generateCitationNumber };
