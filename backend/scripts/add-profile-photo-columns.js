'use strict';

/**
 * My Profile avatar columns — additive, nullable, no data touched.
 *
 *   node scripts/add-profile-photo-columns.js
 *
 * Adds `profile_photo_path VARCHAR(255) NULL` to `drivers` and `enforcers`
 * (matches prisma/schema.prisma). Uses IF NOT EXISTS so it is safe to
 * re-run. Deliberately does NOT run `prisma db push`: push currently also
 * wants to add an unrelated UNIQUE constraint on drivers(username) —
 * pre-existing schema/DB drift that needs its own decision first.
 *
 * Safety rules (mirrors scripts/import-neon.js):
 *  - Uses DATABASE_URL_UNPOOLED (the DIRECT Neon endpoint). Never DDL
 *    through the pooler, never prints the connection string.
 *  - DDL only, no DML: no rows are inserted, updated, or deleted.
 *
 * Rollback (if ever needed):
 *   ALTER TABLE drivers DROP COLUMN IF EXISTS profile_photo_path;
 *   ALTER TABLE enforcers DROP COLUMN IF EXISTS profile_photo_path;
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
    await client.query('ALTER TABLE drivers ADD COLUMN IF NOT EXISTS profile_photo_path VARCHAR(255)');
    await client.query('ALTER TABLE enforcers ADD COLUMN IF NOT EXISTS profile_photo_path VARCHAR(255)');

    const { rows } = await client.query(
      `SELECT table_name, column_name, data_type, is_nullable
         FROM information_schema.columns
        WHERE table_name IN ('drivers', 'enforcers')
          AND column_name = 'profile_photo_path'
        ORDER BY table_name`
    );
    console.log(JSON.stringify(rows, null, 2));

    if (rows.length !== 2) {
      console.error('STOP: expected profile_photo_path on both tables.');
      process.exit(1);
    }
    console.log('OK: avatar columns present, no data modified.');
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(`FAILED: ${err.message}`);
  process.exit(1);
});
