'use strict';

/**
 * tsdown bundler config (build tooling only — not used at runtime).
 *
 * The server keeps running exactly as before: `npm start` / `npm run dev`
 * still execute the plain CommonJS `server.js` against MySQL/Sequelize.
 * `npm run build` is the only thing that reads this file.
 *
 * The `@/*` -> `./src/*` alias is declared HERE and in tsconfig.json
 * (`paths`): tsc is only used for type-level resolution (`--noEmit`) and
 * never rewrites import specifiers at emit, so the bundler must own the
 * actual rewrite.
 *
 * Note: tsdown 0.23 declares engines `^22.18.0 || ^24.11.0 || >=26.0.0`.
 */
module.exports = {
  entry: './server.js',
  format: 'cjs',
  outDir: 'dist',
  platform: 'node',
  clean: true,
  dts: false,
  minify: false,
  tsconfig: './tsconfig.json',
  alias: {
    '@/*': './src/*',
  },
};
