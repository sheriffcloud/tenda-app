import { existsSync } from 'node:fs'
import path from 'node:path'
import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import { getConfig } from '@server/config'
import { acquireBootLock } from '@server/lib/boot-lock'
import type { FastifyBaseLogger } from 'fastify'

// Anything with pino's info(), keeps tests from having to fake a full logger.
type BootLogger = Pick<FastifyBaseLogger, 'info'>

/**
 * Image layout (/app/migrations, see the runtime stage COPY in the
 * Dockerfile) vs repo layout (dev/tests run with CWD apps/server).
 */
export function resolveMigrationsFolder(): string {
  for (const candidate of ['migrations', 'src/db/migrations']) {
    const abs = path.resolve(process.cwd(), candidate)
    if (existsSync(path.join(abs, 'meta/_journal.json'))) return abs
  }
  throw new Error('MIGRATE_ON_BOOT: no migrations folder found')
}

/**
 * Opt-in boot-time migration (MIGRATE_ON_BOOT=true) for push-button deploys
 * (Coolify et al.). Default off = the image keeps migrate-then-roll semantics
 * via the Dockerfile's `migrate` target. The programmatic migrator reads the
 * same meta/_journal.json and writes the same drizzle.__drizzle_migrations
 * journal as `drizzle-kit migrate`, so the two paths are interchangeable.
 *
 * A failed migration throws; startServer turns that into exit 1, so
 * health-gated rollouts keep the old replicas serving.
 */
export async function migrateOnBoot(log: BootLogger, databaseUrl?: string): Promise<void> {
  if (process.env.MIGRATE_ON_BOOT !== 'true') return

  const folder = resolveMigrationsFolder()
  // Dedicated single connection: the advisory lock is session-scoped and the
  // teardown is clean, independent of the pool the db plugin opens later.
  const sql = postgres(databaseUrl ?? getConfig().DATABASE_URL, { max: 1 })
  try {
    log.info({ folder }, 'MIGRATE_ON_BOOT: waiting for advisory lock')
    await acquireBootLock(sql)
    await migrate(drizzle(sql), { migrationsFolder: folder })
    log.info('MIGRATE_ON_BOOT: migrations current')
  } finally {
    await sql.end() // closes the session, which releases the advisory lock
  }
}
