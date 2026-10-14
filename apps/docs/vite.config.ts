import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // Relative asset URLs, so `dist/` serves from a domain root, a subdirectory
  // or the filesystem alike. The site is one page with in-page anchors for the
  // same reason: a client router would need a host rewrite rule to survive a
  // refresh, and that rule is the platform coupling this avoids.
  base: './',
  plugins: [react(), tailwindcss()],
  // Mirrors tsconfig.app.json and vitest.config.ts; a mismatch between the
  // three shows up as a resolution failure rather than a different bundle.
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
})
