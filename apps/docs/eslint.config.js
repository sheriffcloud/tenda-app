import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  // Build output, coverage's vendored reporter assets, and the document this
  // site generates from @tenda/api-doc — none of them hand-written.
  globalIgnores(['dist', 'coverage', 'src/generated']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
  },
  {
    // The generator and the config files run in Node, not the browser.
    files: ['scripts/**/*.ts', '*.config.ts'],
    languageOptions: { globals: globals.node },
  },
])
