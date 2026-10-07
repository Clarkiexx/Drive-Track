# Neon Migration — Phase A Record (Prisma 7 scaffold + schema + import)

> Status: **Phase A complete.** The Express API is untouched and still runs on
> MySQL/Sequelize — every serving-path file (`backend/src/**`, `backend/server.js`,
> `backend/*.sql`, `uploads/`) is byte-identical to before Phase A (verified with
> `git diff`).

## Scope actually changed

| Path | Change |
| --- | --- |
| `prisma/schema.prisma` | **new** — hand-written from `drivetrack_schema_20261001.sql` |
| `prisma.config.ts` | **new** — Prisma 7 config (direct/unpooled URL, schema path) |
| `scripts/import-neon.js` | **new** — dump → Neon importer |
| `scripts/verify-neon.js` | **new** — counts / SUM / FK / spot-row verifier |
| `package.json` | additive: `db:generate`, `db:push` scripts + 4 pinned deps |
| `package-lock.json` | lockfile for the pinned deps |
| `.env` | append-only: `DATABASE_URL` (pooled), `DATABASE_URL_UNPOOLED` (direct) |
| `.env.example` | append-only: placeholder versions of both vars |
| `Docs/NEON_MIGRATION.md` | this file |
| `src/generated/prisma/**` | `prisma generate` output (TypeScript client) — see Open items |

## Pinned dependencies (exact, no `^`)

```
prisma              7.8.0   (devDependency)
@prisma/client      7.8.0
@prisma/adapter-pg  7.7.0
pg                  8.20.0
```

Prisma 8 is already in RC (`npm` banners `8.0.0-rc.20`) — do **not** run
`npm i prisma@latest`, the exact pins are what keep Prisma 7 from moving.

New scripts: `npm run db:generate` (`prisma generate`), `npm run db:push`
(`prisma db push`).

## Connection strings

* **Runtime (Phase B)** → `DATABASE_URL` = **pooled** endpoint
  (hostname contains `-pooler`).
* **CLI / migrations / these scripts** → `DATABASE_URL_UNPOOLED` = **direct**
  endpoint (same host, `-pooler` removed).
* DDL is **never** run through the pooler. `prisma.config.ts` wires the
  datasource to `DATABASE_URL_UNPOOLED`, so every Prisma CLI command uses the
  direct endpoint automatically.
* Secrets live in `backend/.env` only. `git check-ignore -v backend/.env`
  confirms the root `.gitignore` (`.env` on line 4) covers it; `.env.example`
  carries placeholders only; the scripts read the URL from `process.env` at
  runtime and redact `://user:pass@` from any error they print.

## Schema decisions (`prisma/schema.prisma`)

Hand-written from the MariaDB dump — the live MySQL schema was deliberately
**not** introspected, because it carries 7 duplicate unique indexes per logical
key (`username`…`username_7`, `license_number`…`_7`, `citation_number`…`_7`,
`employee_id`…`_7`, `badge_number`…`_7`). Each logical key therefore has exactly
one `@@unique`:

* `Admin.username`, `Driver.licenseNumber`, `Driver.username`,
  `Enforcer.employeeId`, `Enforcer.username`, `Enforcer.badgeNumber`,
  `Citation.citationNumber`.

Other decisions:

* **10 models** with `@@map` on tables and `@map` on every snake_case column;
  field names mirror `src/models/**` (`adminId`, `citationId`, …).
* **9 native Postgres enums**: `RecordType`, `SettlementStatus`, `PaymentMethod`,
  `VerificationStatus`, `EnforcerStatus`, `ViolationCategory`, `RecipientType`,
  `NotificationType`, `NotificationStatus`.
* `Boolean` for `driver_under_protest`, `verified`, `must_change_password`,
  `is_active` (MySQL `tinyint(1)`).
* `DateTime @db.Timestamptz(3)` for all datetimes; `@db.Date` for `due_date`,
  `date_of_birth`, `expiration_date`; `Decimal` with dump precision for money
  (`10,2`), lat/lng (`10,7`), `weight_kg (5,2)`, `height_m (4,2)`.
* No `@updatedAt` on `citation_violations`, `evidence`, `audit_logs`,
  `notifications`, `broadcasts` — those tables have no `updated_at` column.
* Dangling ints kept as plain optional columns with **no** relation:
  `drivers.status_changed_by`, `citations.received_by`,
  `broadcasts.recipient_id`.
* FK actions exactly as in the dump: `Cascade` for
  `audit_logs.admin_id`, `broadcasts.admin_id`, `citations.driver_id`,
  `citations.enforcer_id`, `citation_violations.citation_id`,
  `citation_violations.violation_type_id`, `evidence.citation_id`;
  `SetNull` for the four nullable `notifications.*` FKs.
* Generator: `provider = "prisma-client"`, `output = "../src/generated/prisma"`.

**Prisma 7 note:** `url` is no longer allowed inside the `datasource` block of
`schema.prisma` (validation error P1012). The URL now lives exclusively in
`prisma.config.ts`.

## Commands executed (all from `backend/`)

```
npx prisma validate      # -> "The schema ... is valid"
npm run db:generate      # -> Generated Prisma Client (7.8.0)
npm run db:push          # -> "Your database is now in sync ... Done in 3.89s"
node scripts/import-neon.js
node scripts/verify-neon.js
npm run lint             # -> clean (exit 0)
```

### Safety gate before `db push`

Connected through the **direct** URL with `pg` and listed
`information_schema.tables`: `non_system_tables=0` → database was empty, so
`db push` was safe. (Had it not been empty, Phase A would have stopped.)

### Import

`scripts/import-neon.js` parses the positional `INSERT` tuples from
`drivetrack_backup_20261001.sql` with explicit per-table field maps — it does
**not** replay SQL text. Conversions: `0/1 → boolean`, naive-UTC datetime
strings (dump was written with `TIME_ZONE='+00:00'`) → `Date`, date-only kept
as `'YYYY-MM-DD'`, enums passed through, bcrypt hashes byte-identical, explicit
PKs preserved, batches in FK order, one transaction. Afterwards all 10
sequences are `setval`'d past `MAX(id)` (`citation_violations` PK is `id`).

Re-running it on a non-empty database **refuses to execute** (prints `STOP:
<table> already contains N row(s)` and exits 1) — verified.

### Verification numbers (`node scripts/verify-neon.js` → exit 0)

| Table | Dump | Neon |
| --- | ---: | ---: |
| admins | 1 | 1 |
| drivers | 9 | 9 |
| enforcers | 5 | 5 |
| violation_types | 11 | 11 |
| citations | 8 | 8 |
| citation_violations | 15 | 15 |
| evidence | 8 | 8 |
| broadcasts | 4 | 4 |
| notifications | 32 | 32 |
| audit_logs | 46 | 46 |
| **total** | **139** | **139** |

* `SUM(citations.fine_amount)` — **exact match: 12611.00 (1261100 cents)**
* FK orphan checks (`NOT EXISTS`) — **11/11 clean, 0 orphans**
* Spot row per table, every column compared — **10/10 tables match**
  (7 / 28 / 13 / 8 / 25 / 4 / 5 / 7 / 9 / 7 columns respectively)
* Sequences reset past MAX: `admins 1→2`, `drivers 18→19`, `enforcers 6→7`,
  `violation_types 11→12`, `citations 8→9`, `citation_violations 15→16`,
  `evidence 8→9`, `broadcasts 4→5`, `notifications 32→33`, `audit_logs 46→47`

## Day-1 spike: does the Prisma 7 client load under CommonJS?

**No — plain `node` + `require()` cannot load it.**

```
require('.../src/generated/prisma/client')   -> MODULE_NOT_FOUND (no .js emitted)
require('.../src/generated/prisma/client.ts') -> SyntaxError: Unexpected token 'export'
```

The `prisma-client` generator emits **TypeScript** (`client.ts`, `enums.ts`,
`models/*.ts`, …) with ESM syntax and explicit `.ts` import specifiers.

Extra data point for the Phase B decision: with Node's type stripping enabled
(`node --experimental-strip-types`, present in the installed v22.17.1 and
ungated from v22.18+) the same `require('.../client.ts')` **succeeds** and
exports a working `PrismaClient` class (along with `Prisma` and the enums).
So the options for Phase B are:

1. keep the CJS app and require the `.ts` entry (Node ≥ 22.18, or the
   `--experimental-strip-types` flag on 22.17),
2. add a build/bundle step for the generated client, or
3. run Phase B client code as ESM/TypeScript.

## Open items for a human

1. **`backend/src/generated/` is untracked and not gitignored.** It sits inside
   the frozen `backend/src/**` tree (nothing tracked there was modified — the
   only `git status backend/src` output is `?? backend/src/generated/`).
   Decide: ignore it (needs a `.gitignore` entry, which is outside Phase A's
   allowed scope) or commit it. Recommendation: ignore it and regenerate via
   `npm run db:generate`.
2. **Phase B module decision** — driven by the spike above (TypeScript output;
   plain CJS `require` fails).
3. **`package-lock.json` churn** — unavoidable with the pinned installs; review
   alongside `package.json`.
4. **pg warning** (cosmetic, from `sslmode=require`): pg warns that
   `prefer/require/verify-ca` will move to libpq semantics in pg v9. Neon
   connections work today and are verified as `verify-full`; revisit if/when
   `pg` is bumped.
5. **`@prisma/adapter-pg` is installed but unused so far** — Phase A only needs
   `pg` directly. The adapter is for the Prisma 7 client's runtime driver in
   Phase B (the client requires a driver adapter).
