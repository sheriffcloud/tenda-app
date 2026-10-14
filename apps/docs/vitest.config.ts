import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

/**
 * What is worth testing on a page that writes nothing of its own: that it
 * renders what the DOCUMENT says, and that the copy baked into the bundle is
 * still that document. The markup is not the subject — the derivation is.
 *
 * The alias mirrors vite.config.ts and tsconfig.app.json; a mismatch shows up
 * here as a resolution failure rather than as a silently different bundle.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // The landing's rule, for the landing's reason: import the shared module
      // you need, from SOURCE, rather than the package barrel. The barrel is
      // CommonJS (no Vite interop for a linked workspace package) and reaches
      // `db/schema`, which would put drizzle-orm in a page that reads two
      // constants.
      '@tenda/shared/app-info': fileURLToPath(new URL('../../packages/shared/src/constants/app-info.ts', import.meta.url)),
      '@tenda/shared/api-routes': fileURLToPath(new URL('../../packages/shared/src/api/routes.ts', import.meta.url)),
    },
    // pnpm can give a linked dependency its own React copy; two copies break
    // hooks with a null dispatcher. The landing dedupes for the same reason.
    dedupe: ['react', 'react-dom'],
  },
  test: {
    environment: 'jsdom',
    globals: true,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      // Generated data, the DOM handshake, and the harness's own stubs —
      // none of them carry logic a test could hold to anything.
      exclude: ['src/generated/**', 'src/main.tsx', 'src/test-support/**'],
      thresholds: { statements: 90, branches: 90, functions: 90, lines: 90 },
    },
  },
})
