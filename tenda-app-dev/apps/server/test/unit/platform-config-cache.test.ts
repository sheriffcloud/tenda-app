/**
 * lib/platform — the unseeded fallback and the cache invalidation hook.
 *
 * The fallback previously drifted from the schema: it claimed a 24h grace
 * period against a 1h column default, so a fresh deployment silently ran a
 * different submit window than a seeded one. Both now read the shared
 * PLATFORM_CONFIG_DEFAULTS; this suite pins that they agree, and covers
 * `invalidatePlatformConfigCache`, which the admin PATCH path relies on and
 * which had no test.
 */

import { test } from 'node:test'
import * as assert from 'node:assert'

// The unseeded fallback reads PLATFORM_FEE_BPS through getConfig(), which
// loads env lazily on first call — stub before importing the lib.
process.env.DATABASE_URL ??= 'postgres://localhost/test'
process.env.JWT_SECRET ??= 'test-secret'
process.env.CLOUDINARY_CLOUD_NAME ??= 'test-cloud'
process.env.CLOUDINARY_API_KEY ??= 'test-key'
process.env.CLOUDINARY_API_SECRET ??= 'test-secret-cl'
process.env.API_BASE_URL ??= 'http://127.0.0.1:3000'

import { PLATFORM_CONFIG_DEFAULTS } from '@tenda/shared'
import { platform_config } from '@tenda/shared/db/schema'
import { getPlatformConfig, invalidatePlatformConfigCache } from '@server/lib/platform'
import type { AppDatabase } from '@server/plugins/db'

/**
 * Minimal stand-in for the one call `getPlatformConfig` makes:
 * `db.select().from(platform_config).limit(1)`. Counts reads so cache hits are
 * observable.
 */
function fakeDb(rows: (typeof platform_config.$inferSelect)[]): {
  db: AppDatabase
  reads: () => number
} {
  let reads = 0
  const chain = {
    from: () => chain,
    limit: async () => {
      reads += 1
      return rows
    },
  }
  const db = { select: () => chain } as unknown as AppDatabase
  return { db, reads: () => reads }
}

function seededRow(over: Partial<typeof platform_config.$inferSelect> = {}) {
  return { id: 1, ...PLATFORM_CONFIG_DEFAULTS, ...over }
}

test('unseeded fallback matches the shared defaults for every tunable', async () => {
  invalidatePlatformConfigCache()
  const { db } = fakeDb([])
  const cfg = await getPlatformConfig(db)

  // fee_bps is the one deployment-specific value (PLATFORM_FEE_BPS env).
  assert.strictEqual(cfg.grace_period_seconds, PLATFORM_CONFIG_DEFAULTS.grace_period_seconds)
  assert.strictEqual(cfg.max_pending_gigs, PLATFORM_CONFIG_DEFAULTS.max_pending_gigs)
  assert.strictEqual(cfg.seeker_fee_bps, PLATFORM_CONFIG_DEFAULTS.seeker_fee_bps)
  assert.strictEqual(
    cfg.approval_window_seconds,
    PLATFORM_CONFIG_DEFAULTS.approval_window_seconds,
  )
  assert.strictEqual(typeof cfg.fee_bps, 'number')
})

test('the fallback grace period is the 1h column default, not the old 24h drift', async () => {
  invalidatePlatformConfigCache()
  const { db } = fakeDb([])
  const cfg = await getPlatformConfig(db)
  assert.strictEqual(cfg.grace_period_seconds, 3_600)
  assert.notStrictEqual(cfg.grace_period_seconds, 86_400)
})

test('a seeded row wins over the defaults', async () => {
  invalidatePlatformConfigCache()
  const { db } = fakeDb([seededRow({ max_pending_gigs: 7, grace_period_seconds: 120 })])
  const cfg = await getPlatformConfig(db)
  assert.strictEqual(cfg.max_pending_gigs, 7)
  assert.strictEqual(cfg.grace_period_seconds, 120)
})

test('repeat reads are served from cache (one DB hit)', async () => {
  invalidatePlatformConfigCache()
  const { db, reads } = fakeDb([seededRow()])
  await getPlatformConfig(db)
  await getPlatformConfig(db)
  await getPlatformConfig(db)
  assert.strictEqual(reads(), 1)
})

test('invalidating the cache forces the next read to hit the DB', async () => {
  invalidatePlatformConfigCache()
  const { db, reads } = fakeDb([seededRow()])
  await getPlatformConfig(db)
  assert.strictEqual(reads(), 1)

  invalidatePlatformConfigCache()
  await getPlatformConfig(db)
  assert.strictEqual(reads(), 2)
})

test('an admin update is visible immediately after invalidation', async () => {
  invalidatePlatformConfigCache()
  const rows = [seededRow({ max_pending_gigs: 2 })]
  const { db } = fakeDb(rows)
  assert.strictEqual((await getPlatformConfig(db)).max_pending_gigs, 2)

  rows[0] = seededRow({ max_pending_gigs: 5 })
  // Without invalidation the stale value persists — that is the whole reason
  // the admin PATCH route calls it.
  assert.strictEqual((await getPlatformConfig(db)).max_pending_gigs, 2)
  invalidatePlatformConfigCache()
  assert.strictEqual((await getPlatformConfig(db)).max_pending_gigs, 5)
})
