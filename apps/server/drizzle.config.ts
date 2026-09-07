import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: '../../packages/shared/src/db/schema/index.ts',
  out: './src/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
})
