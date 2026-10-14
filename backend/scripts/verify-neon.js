'use strict';

/**
 * Phase A step 6 — verify the Neon import against the MariaDB dump.
 *
 *   node scripts/verify-neon.js
 *
 * Checks (any failure => non-zero exit):
 *   1. Per-table row counts vs drivetrack_backup_20261001.sql
 *   2. SUM(citations.fine_amount) — exact (BigInt cents, no float maths)
 *   3. FK orphan checks (NOT EXISTS) for every FK in the dump
 *   4. One spot row per table: every column compared against the dump
 *
 * Reads DATABASE_URL_UNPOOLED from backend/.env (DIRECT endpoint) at runtime
 * and never prints the connection string.
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { Client, types } = require('pg');

// Keep date-only columns as literal 'YYYY-MM-DD' strings so they compare
// byte-for-byte with the dump (avoids local-timezone Date shifting).
types.setTypeParser(1082, (value) => value);

const DUMP_PATH = path.join(__dirname, '..', 'drivetrack_backup_20261001.sql');

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

// Column order/types MUST match the dump (kept in sync with import-neon.js).
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

// Every FK declared in the source dump (orphan = child row with no parent).
const FK_CHECKS = [
  ['audit_logs.admin_id -> admins.admin_id', 'audit_logs', 'admin_id', 'admins', 'admin_id'],
  ['broadcasts.admin_id -> admins.admin_id', 'broadcasts', 'admin_id', 'admins', 'admin_id'],
  ['citations.driver_id -> drivers.driver_id', 'citations', 'driver_id', 'drivers', 'driver_id'],
  ['citations.enforcer_id -> enforcers.enforcer_id', 'citations', 'enforcer_id', 'enforcers', 'enforcer_id'],
  ['citation_violations.citation_id -> citations.citation_id', 'citation_violations', 'citation_id', 'citations', 'citation_id'],
  ['citation_violations.violation_type_id -> violation_types.violation_type_id', 'citation_violations', 'violation_type_id', 'violation_types', 'violation_type_id'],
  ['evidence.citation_id -> citations.citation_id', 'evidence', 'citation_id', 'citations', 'citation_id'],
  ['notifications.driver_id -> drivers.driver_id', 'notifications', 'driver_id', 'drivers', 'driver_id'],
  ['notifications.citation_id -> citations.citation_id', 'notifications', 'citation_id', 'citations', 'citation_id'],
  ['notifications.broadcast_id -> broadcasts.broadcast_id', 'notifications', 'broadcast_id', 'broadcasts', 'broadcast_id'],
  ['notifications.enforcer_id -> enforcers.enforcer_id', 'notifications', 'enforcer_id', 'enforcers', 'enforcer_id'],
];

// ---------------------------------------------------------------------------
// Dump parsing (same parser as import-neon.js — no SQL replay)
// ---------------------------------------------------------------------------

const ESCAPES = { 0: '\0', b: '\b', n: '\n', r: '\r', t: '\t', Z: '\x1a' };

function parseTupleList(sql, start) {
  const rows = [];
  let i = start;
  const skipWs = () => {
    while (i < sql.length && /\s/.test(sql[i])) i += 1;
  };
  skipWs();
  while (sql[i] === '(') {
    i += 1;
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
  if (sql[i] !== ';') throw new Error("Expected ';' after INSERT VALUES near offset " + i);
  return { rows, end: i + 1 };
}

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
      return raw;
    case 'datetime':
      return toUtcDate(raw);
    case 'date':
      return raw;
    case 'str':
    case 'text':
    case 'enum':
      return raw;
    default:
      throw new Error('Unknown column type: ' + type);
  }
}

function loadDump() {
  const sql = fs.readFileSync(DUMP_PATH, 'utf8');
  const payloads = {};
  for (const { table, rows } of extractInserts(sql)) {
    const spec = FIELD_MAPS[table];
    if (!spec) throw new Error('No field map for dump table ' + table);
    if (!payloads[table]) payloads[table] = [];
    for (const tuple of rows) {
      if (tuple.length !== spec.columns.length) {
        throw new Error(table + ': tuple has ' + tuple.length + ' values, expected ' + spec.columns.length);
      }
      const row = {};
      spec.columns.forEach(([name, type], idx) => {
        row[name] = coerce(type, tuple[idx]);
      });
      payloads[table].push(row);
    }
  }
  return payloads;
}

// ---------------------------------------------------------------------------
// Comparison helpers
// ---------------------------------------------------------------------------

function canonicalDecimal(text) {
  const s = String(text);
  if (!s.includes('.')) return s;
  const trimmed = s.replace(/0+$/, '').replace(/\.$/, '');
  return trimmed === '' || trimmed === '-' ? '0' : trimmed;
}

function toCents(text) {
  const s = String(text).trim();
  const negative = s.startsWith('-');
  const [intPart, frac = ''] = s.replace('-', '').split('.');
  if (frac.length > 2) throw new Error('Unexpected precision in decimal: ' + s);
  const cents = BigInt(intPart + (frac + '00').slice(0, 2));
  return negative ? -cents : cents;
}

function normalizeDumpValue(type, value) {
  if (value === null) return null;
  switch (type) {
    case 'int':
      return Number(value);
    case 'bool':
      return Boolean(value);
    case 'decimal':
      return canonicalDecimal(value);
    case 'datetime':
      return value instanceof Date ? value.toISOString() : toUtcDate(String(value)).toISOString();
    case 'date':
      return String(value);
    default:
      return String(value);
  }
}

function normalizeDbValue(type, value) {
  if (value === null || value === undefined) return null;
  switch (type) {
    case 'int':
      return Number(value);
    case 'bool':
      return Boolean(value);
    case 'decimal':
      return canonicalDecimal(value);
    case 'datetime':
      return value instanceof Date ? value.toISOString() : toUtcDate(String(value)).toISOString();
    case 'date':
      return value instanceof Date ? value.toISOString().slice(0, 10) : String(value);
    default:
      return String(value);
  }
}

function redact(text) {
  return String(text).replace(/:\/\/[^@\s'"]*@/g, '://***@');
}

function fmt(value) {
  if (value === null) return 'NULL';
  const s = String(value);
  return s.length > 70 ? s.slice(0, 67) + '...' : s;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const url = process.env.DATABASE_URL_UNPOOLED;
  if (!url) {
    console.error('FATAL: DATABASE_URL_UNPOOLED is not set in backend/.env');
    process.exit(2);
  }

  const expected = loadDump();
  const client = new Client({ connectionString: url });
  await client.connect();

  const failures = [];
  const fail = (msg) => {
    failures.push(msg);
    console.log('  FAIL  ' + msg);
  };
  const pass = (msg) => console.log('  ok    ' + msg);

  try {
    // 1. Per-table counts ---------------------------------------------------
    console.log('\n[1] row counts vs dump');
    for (const table of TABLE_ORDER) {
      const exp = expected[table].length;
      const res = await client.query('SELECT COUNT(*)::int AS n FROM "' + table + '"');
      const act = res.rows[0].n;
      if (act === exp) pass(table + ': ' + act + ' == ' + exp);
      else fail(table + ': db=' + act + ' dump=' + exp);
    }

    // 2. SUM(fine_amount) exact --------------------------------------------
    console.log('\n[2] SUM(citations.fine_amount)');
    const expSum = expected.citations.reduce(
      (acc, row) => (row.fine_amount === null ? acc : acc + toCents(row.fine_amount)),
      0n
    );
    const sumRes = await client.query('SELECT COALESCE(SUM("fine_amount"), 0)::text AS s FROM "citations"');
    const actSum = toCents(sumRes.rows[0].s);
    if (actSum === expSum) {
      pass('exact match: ' + Number(expSum) / 100 + ' (' + expSum + ' cents)');
    } else {
      fail('SUM mismatch: db=' + actSum + ' cents, dump=' + expSum + ' cents');
    }

    // 3. FK orphan checks ---------------------------------------------------
    console.log('\n[3] FK orphan checks (NOT EXISTS)');
    for (const [label, childTable, childCol, parentTable, parentCol] of FK_CHECKS) {
      const sql =
        'SELECT COUNT(*)::int AS n FROM "' + childTable + '" c WHERE c."' + childCol + '" IS NOT NULL' +
        ' AND NOT EXISTS (SELECT 1 FROM "' + parentTable + '" p WHERE p."' + parentCol + '" = c."' + childCol + '")';
      const res = await client.query(sql);
      const n = res.rows[0].n;
      if (n === 0) pass(label + ': 0 orphans');
      else fail(label + ': ' + n + ' orphaned row(s)');
    }

    // 4. Spot row per table -------------------------------------------------
    console.log('\n[4] spot row per table (every column vs dump)');
    for (const table of TABLE_ORDER) {
      const spec = FIELD_MAPS[table];
      const dumpRows = expected[table];
      if (dumpRows.length === 0) {
        fail(table + ': dump has no rows to spot-check');
        continue;
      }
      const res = await client.query(
        'SELECT * FROM "' + table + '" ORDER BY "' + spec.pk + '" ASC LIMIT 1'
      );
      if (res.rows.length === 0) {
        fail(table + ': no row in database');
        continue;
      }
      const dbRow = res.rows[0];
      const pkValue = Number(dbRow[spec.pk]);
      const dumpRow = dumpRows.find((r) => Number(r[spec.pk]) === pkValue) || dumpRows[0];
      const diffs = [];
      for (const [col, type] of spec.columns) {
        const exp = normalizeDumpValue(type, dumpRow[col]);
        const act = normalizeDbValue(type, dbRow[col]);
        if (exp !== act) diffs.push(col + ': dump=' + fmt(exp) + ' db=' + fmt(act));
      }
      if (diffs.length === 0) pass(table + ': row ' + pkValue + ' matches (' + spec.columns.length + ' columns)');
      else fail(table + ': row ' + pkValue + ' -> ' + diffs.join(' | '));
    }
  } catch (err) {
    console.error('VERIFY ERROR: ' + redact(err && err.message ? err.message : err));
    failures.push('exception: ' + (err && err.message ? err.message : String(err)));
  } finally {
    await client.end().catch(() => {});
  }

  console.log('');
  if (failures.length > 0) {
    console.log('VERIFICATION FAILED — ' + failures.length + ' problem(s):');
    for (const f of failures) console.log('  - ' + f);
    process.exit(1);
  }
  console.log('VERIFICATION PASSED — all checks green.');
  process.exit(0);
}

main().catch((err) => {
  console.error('VERIFY ERROR: ' + redact(err && err.message ? err.message : err));
  process.exit(1);
});
