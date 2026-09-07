/**
 * Drizzle implementation of the moderation store seam + the dependency
 * builder routes use (config → transport → provider wiring lives once
 * here, mirroring lib/onboarding-deps.ts).
 */

import { and, eq } from 'drizzle-orm'
import {
  category_price_stats,
  moderation_verdicts,
} from '@tenda/shared/db/schema/moderation'
import { platform_config } from '@tenda/shared/db/schema/governance'
import type { FastifyInstance } from 'fastify'
import { getConfig } from '@server/config'
import type { AppDatabase } from '@server/plugins/db'
import {
  inProcessVerdictCache,
  type ModerationDeps,
  type ModerationStore,
  type VerdictCache,
} from '@server/features/moderation/service'
import {
  openRouterProvider,
  openRouterTransport,
  displayAmount,
} from '@server/features/moderation/providers/openrouter'

export function drizzleModerationStore(db: AppDatabase): ModerationStore {
  return {
    async getRulesVersion() {
      const rows = await db
        .select({ v: platform_config.moderation_rules_version })
        .from(platform_config)
        .where(eq(platform_config.id, 1))
        .limit(1)
      return rows[0]?.v ?? 1
    },

    async getPriceStats(category, country, asset) {
      const rows = await db
        .select({
          p10: category_price_stats.p10_amount_raw,
          p50: category_price_stats.p50_amount_raw,
          p90: category_price_stats.p90_amount_raw,
          sample_size: category_price_stats.sample_size,
        })
        .from(category_price_stats)
        .where(
          and(
            eq(category_price_stats.category, category),
            eq(category_price_stats.country, country),
            eq(category_price_stats.asset, asset),
          ),
        )
        .limit(1)
      const row = rows[0]
      if (row === undefined || row.p10 === null || row.p50 === null || row.p90 === null) {
        return null
      }
      // Stored RAW (the rollup job writes raw percentiles); comparisons stay
      // raw-to-raw in the service, prompts convert to display units.
      return {
        p10_raw: row.p10,
        p50_raw: row.p50,
        p90_raw: row.p90,
        sample_size: row.sample_size,
      }
    },

    async insertVerdict(v) {
      const rows = await db
        .insert(moderation_verdicts)
        .values(v)
        .returning({ id: moderation_verdicts.id })
      return { id: rows[0]?.id ?? '' }
    },
  }
}

/** Process-wide cache instance (S5.4 swaps this for Redis behind the seam). */
const processCache: VerdictCache = inProcessVerdictCache()

export function buildModerationDeps(fastify: FastifyInstance): ModerationDeps {
  const config = getConfig()
  return {
    store: drizzleModerationStore(fastify.db),
    cache: processCache,
    llm:
      config.OPENROUTER_API_KEY !== null
        ? openRouterProvider(openRouterTransport(config.OPENROUTER_API_KEY), {
            model: config.OPENROUTER_MODERATION_MODEL,
            timeoutMs: config.OPENROUTER_MODERATION_TIMEOUT_MS,
            maxOutputTokens: config.OPENROUTER_MODERATION_MAX_OUTPUT_TOKENS,
          })
        : null,
    log: fastify.log,
    now: () => Date.now(),
  }
}

export { displayAmount }
