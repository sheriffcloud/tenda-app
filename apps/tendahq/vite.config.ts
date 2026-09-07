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
    },
    dedupe: ['react', 'react-dom'],
  },
})
