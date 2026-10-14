'use strict';

/**
 * Violation-type penalty range columns — additive, nullable, no data touched.
 *
 *   node scripts/add-penalty-range-columns.js
 *
 * Adds `min_penalty` / `max_penalty NUMERIC(10,2) NULL` to `violation_types`
 * (matches prisma/schema.prisma). Uses IF NOT EXISTS so it is safe to
 * re-run. Deliberately does NOT run `prisma db push`: push currently also
 * wants to add an unrelated UNIQUE constraint on drivers(username) —
 * pre-existing schema/DB drift that needs its own decision first.
 *
 * Safety rules (mirrors scripts/add-profile-photo-columns.js):
 *  - Uses DATABASE_URL_UNPOOLED (the DIRECT Neon endpoint). Never DDL
 *    through the pooler, never prints the connection string.
 *  - DDL only, no DML: no rows are inserted, updated, or deleted.
 *
 * Rollback (if ever needed):
 *   ALTER TABLE violation_types DROP COLUMN IF EXISTS min_penalty;
 *   ALTER TABLE violation_types DROP COLUMN IF EXISTS max_penalty;
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
    await client.query('ALTER TABLE violation_types ADD COLUMN IF NOT EXISTS min_penalty NUMERIC(10,2)');
    await client.query('ALTER TABLE violation_types ADD COLUMN IF NOT EXISTS max_penalty NUMERIC(10,2)');

    const { rows } = await client.query(
      `SELECT table_name, column_name, data_type, is_nullable
         FROM information_schema.columns
        WHERE table_name = 'violation_types'
          AND column_name IN ('min_penalty', 'max_penalty')
        ORDER BY column_name`
    );
    console.log(JSON.stringify(rows, null, 2));

    if (rows.length !== 2) {
      console.error('STOP: expected both range columns on violation_types.');
      process.exit(1);
    }
    console.log('OK: range columns present, no data modified.');
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(`FAILED: ${err.message}`);
  process.exit(1);
});
