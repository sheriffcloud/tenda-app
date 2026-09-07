import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

/**
 * The landing had no test harness at all, which is how a page whose whole job
 * is stating true facts ended up stating several false ones. What is tested
 * here is not the markup — it is the DERIVATION: the copy that is computed
 * from the chain manifest, the payout registry and the platform-config
 * defaults, plus the arithmetic behind the worked fee example.
 *
 * The aliases must mirror vite.config.ts and tsconfig.app.json. Three source
 * files agree on the same entries; a mismatch shows up here as a resolution
 * failure rather than as a silently different bundle.
 */
Object.assign(process.env, { NODE_ENV: 'test' })

const shared = (p: string) => fileURLToPath(new URL(`../../packages/shared/src/${p}`, import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@tenda/shared/chains': shared('chains/index.ts'),
      '@tenda/shared/app-info': shared('constants/app-info.ts'),
      '@tenda/shared/fiat/payout': shared('fiat/payout/index.ts'),
      // Prefix alias, not one entry per constant: every shared constants module
      // is a flat file under `constants/`, so a wildcard covers platform,
      // assets, currencies and categories, and the next one costs no config in
      // any of the three files. Vite resolves the missing extension itself
      // (`.ts` is in its default `resolve.extensions`).
      '@tenda/shared/constants/': shared('constants/'),
    },
  },
  test: {
    // `__tests__` directories, matching apps/web, apps/admin and apps/mobile.
    include: ['src/**/__tests__/**/*.test.{ts,tsx}'],
    /**
     * `src/env.ts` THROWS at import on a missing var, by design — a build with
     * no API base URL should fail loudly rather than ship a page that silently
     * fetches nothing. That makes these mandatory for any test whose import
     * chain reaches the API client, which the FAQ's does through <FeePct />.
     * The values are never dialled: no test performs a request.
     */
    env: {
      VITE_API_BASE_URL: 'http://127.0.0.1:3000',
      VITE_WEB_APP_URL: 'http://127.0.0.1:3200',
    },
    coverage: {
      provider: 'v8',
      // Only the derived-content layer is instrumented, and the exclusions are
      // named rather than left implicit:
      //   - components render derived values; asserting on their markup would
      //     be the decorative kind of test this repo bans. The one exception
      //     that carries real claims — the FAQ answers — IS tested, by
      //     rendering them and reading the text back.
      //   - `src/hooks` and `src/api` are network effects. Their one piece of
      //     pure logic, `toPercent`, has its own test; instrumenting the
      //     fetch/useEffect bodies around it would measure a mock.
      //   - `src/components/**` is markup, with ONE named exception below.
      // That exception is the page rhythm (#55): `landing-sections.ts` holds no
      // markup at all — it is the ordered spine plus the pure function that
      // derives each section's surface from its position, which is derivation
      // of exactly the kind this scope exists to measure. It lives under
      // `components/` because that is where the sections it orders live, not
      // because it renders anything.
      include: [
        'src/content/**',
        'src/lib/**',
        'src/components/sections/landing-sections.ts',
      ],
      // The barrel is re-exports only; test files must not instrument themselves.
      exclude: ['src/content/index.ts', '**/__tests__/**'],
      thresholds: { statements: 90, branches: 90, functions: 90, lines: 90 },
    },
  },
})
