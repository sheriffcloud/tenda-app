// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    // `.expo/` is generated (expo-router's route types among it) and carries
    // directives for code nobody here wrote; `dist/` is build output.
    ignores: ['dist/*', '.expo/*'],
  },
  {
    // The jest harness runs under jest's globals like any suite does — it is
    // just not matched by the test-file patterns eslint-config-expo applies
    // them to, which is why `jest.fn` read as undefined here alone.
    files: ['jest.setup.js'],
    languageOptions: { globals: { jest: 'readonly' } },
  },
  {
    // TEST FILES ONLY. Two rules that are right for source are wrong for the way
    // this suite mocks, and between them they were 555 of the 591 warnings the
    // tree carried — drowning the 36 that were real.
    //
    //   import/first  — `jest.mock(...)` has to come BEFORE the imports it
    //     replaces. babel-jest hoists the call over them, but the SOURCE ORDER
    //     is how a reader (and the factory's closure over `mock*` variables)
    //     knows what is mocked; reordering imports above it is exactly the
    //     breakage a blanket `--fix` would cause.
    //   @typescript-eslint/no-require-imports — a mock FACTORY is hoisted out of
    //     module scope, so it cannot close over an `import`ed binding; it
    //     `require`s what it needs at call time.
    //
    // SOURCE KEEPS BOTH RULES. __tests__/lint-test-file-policy.test.ts pins that, so this
    // block cannot widen into the app unnoticed.
    files: ['**/__tests__/**', '**/*.test.{ts,tsx}', '**/__mocks__/**', '**/__fixtures__/**'],
    rules: {
      'import/first': 'off',
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
]);
