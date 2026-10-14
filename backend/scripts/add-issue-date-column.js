'use strict';

/**
 * Driver license issue-date column — additive, nullable, no data touched.
 *
 *   node scripts/add-issue-date-column.js
 *
 * Adds `issue_date DATE NULL` to `drivers` (matches prisma/schema.prisma).
 * Uses IF NOT EXISTS so it is safe to re-run. Deliberately does NOT run
 * `prisma db push`: push currently also wants to add an unrelated UNIQUE
 * constraint on drivers(username) — pre-existing schema/DB drift that needs
 * its own decision first.
 *
 * Safety rules (mirrors scripts/add-profile-photo-columns.js):
 *  - Uses DATABASE_URL_UNPOOLED (the DIRECT Neon endpoint). Never DDL
 *    through the pooler, never prints the connection string.
 *  - DDL only, no DML: no rows are inserted, updated, or deleted.
 *
 * Rollback (if ever needed):
 *   ALTER TABLE drivers DROP COLUMN IF EXISTS issue_date;
 */

require('dotenv').config();
const { Client } = require('pg');

async function main() {
  const connectionString = process.env.DATABASE_URL_UNPOOLED;
  if (!connectionString) {
    console.error('STOP: DATABASE_URL_UNPOOLED is not set.');
    process.exit(1);
  }

  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query('ALTER TABLE drivers ADD COLUMN IF NOT EXISTS issue_date DATE');

    const { rows } = await client.query(
      `SELECT table_name, column_name, data_type, is_nullable
         FROM information_schema.columns
        WHERE table_name = 'drivers'
          AND column_name = 'issue_date'`
    );
    console.log(JSON.stringify(rows, null, 2));

    if (rows.length !== 1) {
      console.error('STOP: expected issue_date on drivers.');
      process.exit(1);
    }
    console.log('OK: issue_date present, no data modified.');
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(`FAILED: ${err.message}`);
  process.exit(1);
});
