import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // Point at the shared package's TS SOURCE, not its CJS dist — linked
      // workspace packages skip Vite's CJS interop, so the dist build can't be
      // imported here. Bundling the source also drops the build-order coupling.
      '@tenda/shared/chains': fileURLToPath(
        new URL('../../packages/shared/src/chains/index.ts', import.meta.url),
      ),
      // Same source-not-dist rule for the shared brand facts.
      '@tenda/shared/app-info': fileURLToPath(
        new URL('../../packages/shared/src/constants/app-info.ts', import.meta.url),
      ),
      // And for the payout registry, so "which markets can trade fiat" is read
      // from the same specs the server validates against rather than retyped.
      '@tenda/shared/fiat/payout': fileURLToPath(
        new URL('../../packages/shared/src/fiat/payout/index.ts', import.meta.url),
      ),
      // And for the shared constants, as a PREFIX rather than one entry per
      // module. They are flat files under `constants/`, so this single line
      // covers the platform-config defaults (the fee/window figures the page
      // prints are the same constants the server falls back to), asset display
      // metadata, the currency vocabulary and the category registry — and the
      // next constant needs no edit here, in tsconfig.app.json, or in
      // vitest.config.ts. Vite appends the extension itself; `.ts` is in its
      // default `resolve.extensions`.
      '@tenda/shared/constants/': fileURLToPath(
        new URL('../../packages/shared/src/constants/', import.meta.url),
      ),
    },
    dedupe: ['react', 'react-dom'],
  },
})
