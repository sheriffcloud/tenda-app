import fp from 'fastify-plugin'
import postgres from 'postgres'
import { drizzle, PostgresJsDatabase } from 'drizzle-orm/postgres-js'
// The whole promoted barrel, the schema map can never drift from the
// source of truth as tables are added.
import * as schema from '@tenda/shared/db/schema'
import { getConfig } from '@server/config'

export type AppDatabase = PostgresJsDatabase<typeof schema>

/**
 * The transaction handle drizzle passes to `db.transaction(tx => …)`, derived
 * from `AppDatabase` so it never drifts.
 */
export type AppTransaction = Parameters<Parameters<AppDatabase['transaction']>[0]>[0]

/**
 * Either the root client or a transaction, for helpers that must run both
 * standalone and inside a caller's transaction (e.g. the advisory-locked
 * create/dedup path) without an `any` cast.
 */
export type AppDb = AppDatabase | AppTransaction

// Augmentation lives in `src/types/fastify.d.ts` so module-load order
// (ts-node lazy compilation) doesn't determine whether TS sees the decorator.

export default fp(
  async (fastify) => {
    const sql = postgres(getConfig().DATABASE_URL)
    const db = drizzle(sql, { schema })

    fastify.decorate('db', db)

    fastify.addHook('onClose', async () => {
      await sql.end()
    })
  },
  { name: 'db' },
)
