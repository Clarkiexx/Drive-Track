'use strict';

/**
 * Phase A step 5 — import the MariaDB dump into Neon (PostgreSQL).
 *
 *   node scripts/import-neon.js
 *
 * It parses the positional INSERT tuples out of
 * `drivetrack_backup_20261001.sql` (it does NOT replay raw SQL text) and
 * writes them through parameterised INSERTs in FK-safe order, then rewinds
 * all 10 sequences past MAX(id).
 *
 * Safety rules:
 *  - Uses DATABASE_URL_UNPOOLED (the DIRECT Neon endpoint). Never DDL/DML
 *    through the pooler, never prints the connection string.
 *  - Refuses to run if any target table already has rows (no data loss).
 *  - Runs everything inside one transaction: all-or-nothing.
 *
 * Encoding rules (per column, explicit in FIELD_MAPS below):
 *  - tinyint(1) flags -> boolean
 *  - naive datetime strings (dump was written with TIME_ZONE='+00:00')
 *    -> Date objects interpreted as UTC
 *  - date-only columns -> kept as the literal 'YYYY-MM-DD' string
 *  - enums -> passed through as-is
 *  - decimals -> passed through as exact decimal text (no float rounding)
 *  - bcrypt hashes -> passed through byte-identical (plain strings)
 *  - explicit PKs -> preserved as-is
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { Client } = require('pg');

const DUMP_PATH = path.join(__dirname, '..', 'drivetrack_backup_20261001.sql');

// FK-safe insert order.
const TABLE_ORDER = [
  'admins',
  'drivers',
  'enforcers',
  'violation_types',
  'citations',
  'citation_violations',
  'evidence',
  'broadcasts',
  'notifications',
  'audit_logs',
];

// Every table: primary key column + the dump's column order with the target
// JS/Postgres type for each column. Column order MUST match the dump.
const FIELD_MAPS = {
  admins: {
    pk: 'admin_id',
    columns: [
      ['admin_id', 'int'],
      ['first_name', 'str'],
      ['last_name', 'str'],
      ['username', 'str'],
      ['password_hash', 'str'],
      ['created_at', 'datetime'],
      ['updated_at', 'datetime'],
    ],
  },
  drivers: {
    pk: 'driver_id',
    columns: [
      ['driver_id', 'int'],
      ['first_name', 'str'],
      ['middle_initial', 'str'],
      ['last_name', 'str'],
      ['address', 'str'],
      ['contact_number', 'str'],
      ['license_number', 'str'],
      ['username', 'str'],
      ['password_hash', 'str'],
      ['must_change_password', 'bool'],
      ['verification_status', 'enum'],
      ['created_at', 'datetime'],
      ['updated_at', 'datetime'],
      ['license_photo_path', 'str'],
      ['status_reason', 'text'],
      ['status_changed_at', 'datetime'],
      ['status_changed_by', 'int'],
      ['nationality', 'str'],
      ['sex', 'str'],
      ['date_of_birth', 'date'],
      ['weight_kg', 'decimal'],
      ['height_m', 'decimal'],
      ['expiration_date', 'date'],
      ['agency_code', 'str'],
      ['blood_type', 'str'],
      ['eye_color', 'str'],
      ['dl_codes', 'str'],
      ['condition', 'str'],
    ],
  },
  enforcers: {
    pk: 'enforcer_id',
    columns: [
      ['enforcer_id', 'int'],
      ['first_name', 'str'],
      ['last_name', 'str'],
      ['employee_id', 'str'],
      ['badge_number', 'str'],
      ['station', 'str'],
      ['username', 'str'],
      ['password_hash', 'str'],
      ['status', 'enum'],
      ['created_at', 'datetime'],
      ['updated_at', 'datetime'],
      ['address', 'str'],
      ['contact_number', 'str'],
    ],
  },
  violation_types: {
    pk: 'violation_type_id',
    columns: [
      ['violation_type_id', 'int'],
      ['article_section', 'str'],
      ['description', 'str'],
      ['category', 'enum'],
      ['default_penalty', 'decimal'],
      ['is_active', 'bool'],
      ['created_at', 'datetime'],
      ['updated_at', 'datetime'],
    ],
  },
  citations: {
    pk: 'citation_id',
    columns: [
      ['citation_id', 'int'],
      ['citation_number', 'str'],
      ['record_type', 'enum'],
      ['driver_id', 'int'],
      ['enforcer_id', 'int'],
      ['vehicle_unit_type', 'str'],
      ['plate_number', 'str'],
      ['registered_owner', 'str'],
      ['other_violation', 'str'],
      ['place_of_violation', 'str'],
      ['occurred_at', 'datetime'],
      ['latitude', 'decimal'],
      ['longitude', 'decimal'],
      ['driver_under_protest', 'bool'],
      ['fine_amount', 'decimal'],
      ['due_date', 'date'],
      ['verified', 'bool'],
      ['settlement_status', 'enum'],
      ['settled_at', 'datetime'],
      ['created_at', 'datetime'],
      ['updated_at', 'datetime'],
      ['fine_override_reason', 'str'],
      ['payment_method', 'enum'],
      ['payment_reference', 'str'],
      ['received_by', 'int'],
    ],
  },
  citation_violations: {
    pk: 'id',
    columns: [
      ['id', 'int'],
      ['citation_id', 'int'],
      ['violation_type_id', 'int'],
      ['penalty_at_issuance', 'decimal'],
    ],
  },
  evidence: {
    pk: 'evidence_id',
    columns: [
      ['evidence_id', 'int'],
      ['citation_id', 'int'],
      ['image_path', 'str'],
      ['description', 'str'],
      ['created_at', 'datetime'],
    ],
  },
  broadcasts: {
    pk: 'broadcast_id',
    columns: [
      ['broadcast_id', 'int'],
      ['admin_id', 'int'],
      ['recipient_type', 'enum'],
      ['message', 'str'],
      ['recipient_count', 'int'],
      ['created_at', 'datetime'],
      ['recipient_id', 'int'],
    ],
  },
  notifications: {
    pk: 'notification_id',
    columns: [
      ['notification_id', 'int'],
      ['driver_id', 'int'],
      ['citation_id', 'int'],
      ['broadcast_id', 'int'],
      ['message', 'text'],
      ['notification_type', 'enum'],
      ['status', 'enum'],
      ['created_at', 'datetime'],
      ['enforcer_id', 'int'],
    ],
  },
  audit_logs: {
    pk: 'audit_log_id',
    columns: [
      ['audit_log_id', 'int'],
      ['admin_id', 'int'],
      ['action', 'str'],
      ['target_type', 'str'],
      ['target_id', 'int'],
      ['details', 'str'],
      ['created_at', 'datetime'],
    ],
  },
};

const BATCH_ROWS = 100;

// ---------------------------------------------------------------------------
// SQL tuple parsing
// ---------------------------------------------------------------------------

const ESCAPES = {
  0: '\0',
  b: '\b',
  n: '\n',
  r: '\r',
  t: '\t',
  Z: '\x1a',
};

/**
 * Parse a MariaDB `('a',1,NULL)` value tuple stream.
 * Returns { values, end } where values is an array of
 * { kind: 'null' | 'string' | 'raw', value }.
 */
function parseTupleList(sql, start) {
  const rows = [];
  let i = start;

  const skipWs = () => {
    while (i < sql.length && (sql[i] === ' ' || sql[i] === '\n' || sql[i] === '\r' || sql[i] === '\t' || sql[i] === '\r')) i++;
  };

  skipWs();
  while (sql[i] === '(') {
    i += 1; // consume '('
    const values = [];
    for (;;) {
      skipWs();
      if (sql[i] === "'") {
        i += 1;
        let out = '';
        let closed = false;
        while (i < sql.length) {
          const c = sql[i];
          if (c === '\\') {
            const nxt = sql[i + 1];
            out += Object.prototype.hasOwnProperty.call(ESCAPES, nxt) ? ESCAPES[nxt] : nxt;
            i += 2;
            continue;
          }
          if (c === "'") {
            if (sql[i + 1] === "'") {
              out += "'";
              i += 2;
              continue;
            }
            i += 1;
            closed = true;
            break;
          }
          out += c;
          i += 1;
        }
        if (!closed) throw new Error('Unterminated string literal at offset ' + i);
        values.push({ kind: 'string', value: out });
      } else {
        const from = i;
        while (i < sql.length && sql[i] !== ',' && sql[i] !== ')') i += 1;
        const token = sql.slice(from, i).trim();
        if (token === '') throw new Error('Empty value token at offset ' + from);
        values.push(token === 'NULL' ? { kind: 'null', value: null } : { kind: 'raw', value: token });
      }
      skipWs();
      if (sql[i] === ',') {
        i += 1;
        continue;
      }
      if (sql[i] === ')') {
        i += 1;
        break;
      }
      throw new Error('Malformed tuple near offset ' + i);
    }
    rows.push(values);
    skipWs();
    if (sql[i] === ',') {
      i += 1;
      skipWs();
      continue;
    }
    break;
  }
  if (sql[i] !== ';') throw new Error("Expected ';' after INSERT VALUES near offset ' + i + '");
  return { rows, end: i + 1 };
}

/** Extract { table, rows } for every INSERT statement in the dump. */
function extractInserts(sql) {
  const marker = 'INSERT INTO `';
  const inserts = [];
  let at = sql.indexOf(marker);
  while (at !== -1) {
    const nameStart = at + marker.length;
    const nameEnd = sql.indexOf('`', nameStart);
    const table = sql.slice(nameStart, nameEnd);
    const valuesKey = ' VALUES ';
    const valuesAt = sql.indexOf(valuesKey, nameEnd);
    if (valuesAt === -1) throw new Error('No VALUES for table ' + table);
    const parsed = parseTupleList(sql, valuesAt + valuesKey.length);
    inserts.push({ table, rows: parsed.rows });
    at = sql.indexOf(marker, parsed.end);
  }
  return inserts;
}

// ---------------------------------------------------------------------------
// Value coercion
// ---------------------------------------------------------------------------

/** Naive dump datetime ('YYYY-MM-DD HH:MM:SS', dump TZ = UTC) -> UTC Date. */
function toUtcDate(text) {
  const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(\.\d+)?$/.exec(text);
  if (!m) throw new Error('Unexpected datetime literal: ' + text);
  return new Date(m[1] + 'T' + m[2] + (m[3] || '') + 'Z');
}

function coerce(type, cell) {
  if (cell.kind === 'null') return null;
  const raw = cell.value;
  switch (type) {
    case 'int':
      return Number(raw);
    case 'bool':
      return Number(raw) !== 0;
    case 'decimal':
      return raw; // exact decimal text — pg casts it to numeric
    case 'datetime':
      return toUtcDate(raw);
    case 'date':
      return raw; // literal 'YYYY-MM-DD'
    case 'str':
    case 'text':
    case 'enum':
      return raw;
    default:
      throw new Error('Unknown column type: ' + type);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function redact(text) {
  return String(text).replace(/:\/\/[^@\s'"]*@/g, '://***@');
}

async function main() {
  const url = process.env.DATABASE_URL_UNPOOLED;
  if (!url) {
    console.error('FATAL: DATABASE_URL_UNPOOLED is not set in backend/.env');
    process.exit(2);
  }

  if (!fs.existsSync(DUMP_PATH)) {
    console.error('FATAL: dump not found at ' + DUMP_PATH);
    process.exit(2);
  }
  const sql = fs.readFileSync(DUMP_PATH, 'utf8');
  const inserts = extractInserts(sql);

  // Build row payloads keyed by table, in dump order.
  const payloads = {};
  for (const { table, rows } of inserts) {
    const spec = FIELD_MAPS[table];
    if (!spec) throw new Error('No field map for dump table ' + table);
    if (!payloads[table]) payloads[table] = [];
    for (const tuple of rows) {
      if (tuple.length !== spec.columns.length) {
        throw new Error(
          table + ': tuple has ' + tuple.length + ' values, expected ' + spec.columns.length
        );
      }
      const row = {};
      spec.columns.forEach(([name, type], idx) => {
        row[name] = coerce(type, tuple[idx]);
      });
      payloads[table].push(row);
    }
  }
  for (const table of TABLE_ORDER) {
    if (!payloads[table]) throw new Error('Dump contains no INSERT for ' + table);
  }

  const client = new Client({ connectionString: url });
  await client.connect();
  let failed = false;
  try {
    // --- Safety: refuse to touch a database that already has data ----------
    for (const table of TABLE_ORDER) {
      const res = await client.query('SELECT COUNT(*)::int AS n FROM "' + table + '"');
      const n = res.rows[0].n;
      if (n > 0) {
        console.error(
          'STOP: "' + table + '" already contains ' + n + ' row(s). Refusing to import (no data will be destroyed).'
        );
        failed = true;
      }
    }
    if (failed) {
      process.exitCode = 1;
      return;
    }

    await client.query('BEGIN');
    let total = 0;
    for (const table of TABLE_ORDER) {
      const spec = FIELD_MAPS[table];
      const cols = spec.columns.map(([name]) => name);
      const rows = payloads[table];
      let inserted = 0;
      for (let offset = 0; offset < rows.length; offset += BATCH_ROWS) {
        const batch = rows.slice(offset, offset + BATCH_ROWS);
        const params = [];
        const tuples = batch.map((row) => {
          const placeholders = cols.map((col) => {
            params.push(row[col]);
            return '$' + params.length;
          });
          return '(' + placeholders.join(',') + ')';
        });
        const sqlText =
          'INSERT INTO "' + table + '" (' + cols.map((c) => '"' + c + '"').join(', ') + ') VALUES ' + tuples.join(',');
        const res = await client.query(sqlText, params);
        inserted += res.rowCount;
      }
      total += inserted;
      console.log('  ' + table.padEnd(20) + ' ' + String(inserted).padStart(5) + ' rows  (dump: ' + rows.length + ')');
      if (inserted !== rows.length) throw new Error(table + ': inserted ' + inserted + ' != parsed ' + rows.length);
    }

    // --- Sequences ---------------------------------------------------------
    console.log('  resetting sequences past MAX(id)...');
    for (const table of TABLE_ORDER) {
      const pk = FIELD_MAPS[table].pk;
      const maxRes = await client.query('SELECT MAX("' + pk + '") AS max FROM "' + table + '"');
      const max = maxRes.rows[0].max;
      if (max === null) {
        await client.query('SELECT setval(pg_get_serial_sequence($1, $2), 1, false)', [table, pk]);
        console.log('    ' + table + '.' + pk + ': empty -> nextval 1');
      } else {
        await client.query('SELECT setval(pg_get_serial_sequence($1, $2), $3, true)', [table, pk, Number(max)]);
        console.log('    ' + table + '.' + pk + ': MAX=' + max + ' -> nextval ' + (Number(max) + 1));
      }
    }

    await client.query('COMMIT');
    console.log('Import committed: ' + total + ' rows across ' + TABLE_ORDER.length + ' tables.');
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (_) {
      /* ignore */
    }
    console.error('IMPORT FAILED: ' + redact(err && err.message ? err.message : err));
    process.exitCode = 1;
  } finally {
    await client.end().catch(() => {});
  }
}

main().catch((err) => {
  console.error('IMPORT FAILED: ' + redact(err && err.message ? err.message : err));
  process.exit(1);
});
