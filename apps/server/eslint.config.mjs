/**
 * Server lint config (testing-strategy.md CI gate #4 — previously
 * mobile-only). Semantic rules only: the repo has no server-side style
 * config, so formatting stays out of scope; typescript-eslint recommended
 * catches the bug classes (unused vars, floating promises are Stage-2 when
 * type-aware linting lands), plus the project's standing no-`any` rule
 * enforced mechanically.
 */

import js from '@eslint/js'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // Project rule: no `any` unless absolutely necessary — make it loud.
      '@typescript-eslint/no-explicit-any': 'error',
      // Underscore-prefixed args are the project's deliberate-unused marker.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
    },
  },
  {
    // Sentry preload (node --require) — intentionally CommonJS.
    files: ['instrument.js'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: { require: 'readonly', module: 'readonly', process: 'readonly' },
    },
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
  {
    // Operator scripts run by `node` directly against a live devnet + server
    // (tests-devnet/), never bundled and never imported by src. Linted anyway
    // — it is what caught a dead import here — but the flat config's default
    // env has no Node globals, so they are declared as for instrument.js
    // above. Extend this list when a script legitimately needs another one.
    files: ['tests-devnet/**/*.mjs'],
    languageOptions: {
      globals: {
        process: 'readonly',
        console: 'readonly',
        fetch: 'readonly',
        Buffer: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        URL: 'readonly',
      },
    },
  },
  {
    // fastify-cli ships no type declarations; its helper is consumed via
    // require() by upstream convention.
    files: ['test/helper.ts'],
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
  {
    // Legacy surface awaiting cutover deletion (#34) — keep it compiling,
    // don't burn effort lint-polishing files on the §2 deletion manifest.
    files: [
      'src/lib/solana.ts',
      'src/lib/exchange.ts',
      'src/lib/disputes.ts',
      'src/routes/v1/blockchain/**',
      'src/routes/v1/gigs/_id/**',
      'src/routes/v1/exchange/_id/**',
    ],
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': 'warn',
    },
  },
)
