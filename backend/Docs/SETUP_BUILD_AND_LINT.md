# Setup: Build Tooling & Lint

Phase: added **tsdown** bundling + a TypeScript `@/*` path alias.
The API starts with `npm start` (`tsx server.js`) / `npm run dev`
(`tsx watch server.js`) and talks to **Neon Postgres via Prisma**
(cutover complete — see `NEON_CUTOVER.md`). `dist/` is never referenced
by any runtime script. No TypeScript rewrite happened — `allowJs` +
`checkJs: false` means TS only *resolves*, it never type-checks or emits
for the existing JS.

## Commands

| Command | What it does |
| --- | --- |
| `npm run build` | `tsdown` → bundles `server.js` to `dist/server.cjs` (CJS, node platform, unminified, no `.d.ts`) |
| `npx tsc --noEmit` | type-level resolution check only, emits nothing |
| `npm run lint` | eslint (now also ignores `dist/`) |
| `npm run seed:admin` / `npm run seed:enforcer` / `npm run seed:violation-types` | seed scripts, each running `tsx seed-*.js` |

**Seeds run through `tsx`, never bare `node`.** Use `npm run seed:admin`,
`npm run seed:enforcer` or `npm run seed:violation-types`; calling one
directly works the same way as `npx tsx seed-admin.js`. Plain
`node seed-*.js` fails, because the generated Prisma client is TypeScript
(`.ts` files with ESM `import.meta`) and only `tsx` resolves that plus the
`@/*` path alias — the same reason `start`/`dev` are `tsx` scripts.

## Files

* `tsconfig.json` — `allowJs:true`, `checkJs:false`, `strict:false`,
  `module:commonjs` + `moduleResolution:node` (matches the existing
  `require()` style), `paths: {"@/*": ["src/*"]}` (no `backend/` prefix: the
  tsconfig lives in `backend/`), includes `server.js`, `src/**`, `seed-*.js`;
  excludes `node_modules`/`dist`/`uploads`/`Docs`. `noEmit:true` so a stray
  `tsc` can never write `.js` files next to the sources.
* `tsdown.config.js` — `entry './server.js'`, `format 'cjs'`, `outDir 'dist'`,
  `platform 'node'`, `clean:true`, `dts:false`, `minify:false`,
  `tsconfig './tsconfig.json'`, `alias {'@/*': './src/*'}`.
* `eslint.config.js` — ignores only: added `dist/`.
* `package.json` — added the `build` script plus devDeps `typescript@~5.9`
  and `tsdown@^0.23.0`. Existing deps and start/dev scripts untouched.

**The alias must be declared in BOTH places** (`tsconfig.json` `paths` and
`tsdown.config.js` `alias`): `tsc --noEmit` only resolves types and never
rewrites import specifiers at emit, so the bundler has to own the actual
`@/*` → `./src/*` rewrite.

## Known environment limit — Node version required to build

`tsdown@0.23.0` declares `engines: ^22.18.0 || ^24.11.0 || >=26.0.0`.
This machine runs **Node v22.17.1**, so `npm run build` currently fails:

```
ERROR  Error: Failed to import module "unrun". Please ensure it is installed.
```

Cause (verified): below Node 22.18 native type-stripping is off by default
(`process.features.typescript === false`), so tsdown's auto config-loader
falls back to `unrun`, an **optional** peer dependency that is not installed
and is intentionally not added here. Upgrading Node to **≥ 22.18** restores
the native loader and removes the need for `unrun`.

Diagnostic note: running `npx tsdown --config-loader native` on this machine
does complete (`dist/server.cjs`, 119 kB, ~120 ms), which proves the config
files themselves are correct — but that flag is a workaround, not the fix.
Do not "fix" this by pinning an older tsdown or by adding `unrun`.
