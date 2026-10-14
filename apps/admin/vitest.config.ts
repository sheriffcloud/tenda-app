import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// Vitest otherwise preserves an inherited NODE_ENV=production and loads
// React's production build, whose test renderer has no act(). Keep direct
// `vitest` invocations as safe as the package scripts.
Object.assign(process.env, { NODE_ENV: 'test' })

// jsdom renders React 19 *client* components only. App Router server
// components / async pages are out of scope here — they are covered by the
// Playwright e2e suite instead.
export default defineConfig({
  plugins: [react()],
  resolve: {
    // Mirror tsconfig "paths": { "@/*": ["./*"] }.
    alias: { '@': fileURLToPath(new URL('.', import.meta.url)) },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./test/setup.tsx'],
    include: ['test/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['lib/**/*.ts', 'app/**/*.tsx', 'components/**/*.tsx', 'api/**/*.ts', 'hooks/**/*.ts'],
      // Excluded with reasons (G4): vendored shadcn UI primitives
      // (components/ui/** — upstream-maintained, not our logic), App-Router
      // layouts + the root redirect page (server components, not renderable
      // under jsdom — Playwright covers those in Phase 2), and type decls.
      exclude: [
        '**/*.d.ts',
        'app/**/layout.tsx',
        'app/page.tsx',
        'components/ui/**',
        // Vendored shadcn hook (upstream-maintained, not our logic).
        'hooks/use-mobile.ts',
      ],
      // Target is line 90 / branch 85. Achieved: lines 98 / branch 85 /
      // stmts 98. `functions` is floored at 85, not 90: the metric counts
      // every inline JSX arrow (onChange state-setters) as a function, so it
      // lags line coverage.
      thresholds: { lines: 90, branches: 85, functions: 85, statements: 90 },
    },
  },
})
