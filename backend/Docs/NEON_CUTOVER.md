# Neon Cutover — Lane A (Prisma foundation, auth/driver/enforcer)

Short operational notes for the MySQL/Sequelize → Neon/Prisma cutover.
Schema and data migration itself are Phase A and are already done.

## What runs now

| | Before (MySQL) | Now (Neon) |
|---|---|---|
| Driver | Sequelize 6 + mysql2 | Prisma 7 + `@prisma/adapter-pg` (pooled `DATABASE_URL`) |
| Start | `npm start` → `node server.js` | `npm start` → `tsx server.js` |
| Dev | `npm run dev` → nodemon | `npm run dev` → `tsx watch server.js` |
| Schema | `sequelize.sync({ alter })` / `DB_SYNC_ALTER` | `npm run db:push` (Prisma owns the schema) |
| Seeds | `node seed-*.js` | `npm run seed:admin` / `seed:enforcer` / `seed:violation-types` (or `npx tsx seed-*.js`) |

**Why `tsx`:** the generated client (`src/generated/prisma/client.ts`) is
TypeScript/ESM, and code uses the `@/*` tsconfig path. Plain `node server.js`
cannot load either — `tsx` resolves both. `node server.js` is intentionally no
longer a script.

Runtime URLs: `DATABASE_URL` (pooled) for the app; `DATABASE_URL_UNPOOLED`
(direct) only for `prisma db push` via `prisma.config.ts`.

## Lane A surface

- `src/lib/prisma.js` — **shared foundation, all lanes import from here**:
  - `prisma` (singleton, `globalThis`-cached so `tsx watch` doesn't leak pools)
  - `prismaErrorToHttp(err)` → `{status, message, errors}`: P2002→409, P2025→404,
    Prisma validation/P2023→422, else 500 (so the generic error handler never
    sees an unmapped Prisma error from these controllers)
  - `toDateOnlyString(date)` → `YYYY-MM-DD` for `@db.Date` columns
  - `toNumber(decimal)` → for money sums at the response edge only
- `src/utils/username.js` — `normalizeUsername` / `buildUsername`, moved
  verbatim from the Sequelize `Driver` model hook (any drift breaks logins).
- `src/controllers/authController.js`, `driverController.js`,
  `enforcerController.js` — rewritten onto Prisma.
- Cross-lane: all lanes (`citation`/`dashboard`/`violationType` and
  notifications/payments/audit) import this module directly via
  `require('../lib/prisma')` — one shared client. (The temporary
  `src/services/prismaClient.js` re-export was removed after unification.)
- `server.js` — connectivity check (`SELECT 1`) + listen; no sync/alter.
- The three `seed-*.js` scripts.

Not yet cut over: every other controller/model/route still imports Sequelize
(`src/models/**`). The rewritten controllers only touch Prisma-backed modules:
`src/services/auditLogService.js` was ported by the notifications/payments
lane, so these controllers keep importing it exactly as before.

## Behavior kept identical

- Route paths/methods, `{success,message,data,errors}` envelopes, all 409/422
  wording, JWT payload `{id,role,mustChangePassword?}` (8h), Bearer scheme,
  express-validator chains, multer handling.
- Login lookups are case-insensitive (`mode: 'insensitive'`), matching the
  MySQL column collation that was removed: enforcer/admin usernames, driver
  license numbers, and every LIKE-style search.
- Driver `username` is recomputed on create/update exactly as the old
  `beforeValidate` hook did.
- `passwordHash` is stripped from every driver/enforcer response.

## Response-body deviations (forced by Prisma)

1. **Decimal trailing zeros.** mysql2 returned column scale
   (`"3500.00"`, `"70.50"`); Prisma's numeric conversion drops it
   (`"3500"`, `"70.5"`). Values are numerically identical and still strings —
   no float math is performed in this lane. Wire format differs only in scale.
2. **`errors` field on mapped Prisma errors** carries a short field hint
   (e.g. `Duplicate value for: username`) or `null`, instead of Sequelize's
   array of per-field messages. Message/status codes are unchanged.
3. Malformed values in writes (e.g. `dateOfBirth: ""`) now map to
   **422 "Validation failed"** via `prismaErrorToHttp`; MySQL would have
   produced a DB error surfaced as 500.

## Verification performed (lane A)

- `node --check` on every touched file
- `npx tsc --noEmit`
- `npm run lint`
- grep: no `sequelize` reference in the files above
- Server **not** booted (orchestrator boots after all lanes)
