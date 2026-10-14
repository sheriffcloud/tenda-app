import { platform_config } from '@tenda/shared/db/schema'
import { PLATFORM_CONFIG_DEFAULTS } from '@tenda/shared'
import { cacheBus } from '@server/lib/cache-invalidation'
import type { AppDatabase } from '@server/plugins/db'

/**
 * The whole singleton row. Inferred from the table rather than re-listed, so
 * a new tunable is readable here the moment the column exists — the previous
 * hand-written interface exposed only 3 of the 6 columns.
 */
export type PlatformConfig = typeof platform_config.$inferSelect

let cache: PlatformConfig | null = null
let cacheExpiry = 0
// Bumped by every invalidation. A read that started before one must not store
// its (possibly pre-mutation) row afterwards — a remote invalidation can land
// while this process is mid-query.
let generation = 0
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

function clearLocal(): void {
  cache = null
  cacheExpiry = 0
  generation += 1
}
cacheBus.register('platform_config', clearLocal)

/**
 * Invalidate the cache on EVERY instance (#29): clears this process's copy and
 * broadcasts so other pods drop theirs. Call after an admin updates
 * platform_config so the next request reads fresh values from the DB.
 */
export function invalidatePlatformConfigCache(): void {
  cacheBus.invalidate('platform_config')
}

/**
 * Read platform configuration from the database.
 * Results are cached for 5 minutes to avoid a DB round-trip on every request.
 *
 * The unseeded fallback comes from the shared PLATFORM_CONFIG_DEFAULTS — the
 * same values the columns default to — so the two can no longer disagree.
 * (They did: the old fallback claimed a 24h grace period against a 1h column
 * default.) The fee is no longer overridable from the environment: it has two
 * sources already (the contract and this row), and `fee:set` keeps them in step.
 */
export async function getPlatformConfig(db: AppDatabase): Promise<PlatformConfig> {
  const now = Date.now()
  if (cache && now < cacheExpiry) {
    return cache
  }

  const startedAt = generation
  const [row] = await db.select().from(platform_config).limit(1)

  const fresh = row ?? { id: 1, ...PLATFORM_CONFIG_DEFAULTS }

  if (startedAt === generation) {
    cache = fresh
    cacheExpiry = now + CACHE_TTL_MS
  }
  return fresh
}

