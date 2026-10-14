'use strict';

/**
 * Step 0 guardrail — static analysis only, zero behavior change.
 *
 * The backend is a CommonJS Node/Express app (no "type": "module" in
 * package.json), so `sourceType: 'commonjs'` is what lets `require`,
 * `module.exports`, and friends parse without spurious errors.
 *
 * Intentionally NOT extending any `recommended` preset yet: existing
 * `src/**` code is frozen for this step, so the config must stay green
 * on the code as it stands today. Rules can be tightened in a later step.
 */
module.exports = [
  {
    // Never lint generated, uploaded, or non-JS artifacts.
    ignores: [
      'node_modules/**',
      'dist/',
      'uploads/**',
      '**/*.sql',
      '.env',
      '**/*.md',
      'Docs/**',
    ],
  },
  {
    files: ['**/*.js'],
    // The existing source ships `eslint-disable` comments for rules this
    // minimal config does not enable yet (no-console, no-unused-vars,
    // no-await-in-loop). Flagging them would just be Step 0 noise.
    linterOptions: {
      reportUnusedDisableDirectives: 'off',
    },
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        // Node / CommonJS runtime globals.
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        setImmediate: 'readonly',
        clearImmediate: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        require: 'readonly',
        module: 'writable',
        exports: 'writable',
      },
    },
    rules: {
      // console.* is used for intentional server-side logging.
      'no-console': 'off',
    },
  },
];
