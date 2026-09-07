/**
 * POST /v1/moderation/preview, dry-run verdict for live UI hints while
 * the user types (stage-6: debounced 800ms client-side, never blocking).
 * Persists with subject_kind='gig_draft' and no subject id; the cache
 * makes the final-submit call free when the input didn't change.
 */

import type { FastifyPluginAsync } from 'fastify'
import { ErrorCode } from '@tenda/shared'
import { AppError } from '@server/lib/errors'
import { moderateGig } from '@server/features/moderation/service'
import { buildModerationDeps } from '@server/features/moderation/store'
import { isAmountRaw } from '@server/chains/types'

interface Body {
  title?: unknown
  description?: unknown
  category?: unknown
  country?: unknown
  asset?: unknown
  amount_raw?: unknown
  asset_decimals?: unknown
}

function str(field: string, v: unknown, max: number): string {
  if (typeof v !== 'string' || v.length === 0 || v.length > max) {
    throw new AppError(422, ErrorCode.VALIDATION_ERROR, `${field} must be 1–${max} chars`)
  }
  return v
}

const route: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Body: Body }>(
    '/',
    { preHandler: [fastify.authenticate] },
    async (request) => {
      const b = request.body ?? {}
      if (!isAmountRaw(b.amount_raw)) {
        throw new AppError(422, ErrorCode.VALIDATION_ERROR, 'amount_raw must be canonical')
      }
      if (
        typeof b.asset_decimals !== 'number' ||
        !Number.isInteger(b.asset_decimals) ||
        b.asset_decimals < 0 ||
        b.asset_decimals > 18
      ) {
        throw new AppError(422, ErrorCode.VALIDATION_ERROR, 'asset_decimals must be 0–18')
      }
      const verdict = await moderateGig(
        buildModerationDeps(fastify),
        {
          title: str('title', b.title, 200),
          description: typeof b.description === 'string' ? b.description.slice(0, 5000) : '',
          category: str('category', b.category, 100),
          country: str('country', b.country, 100),
          asset: str('asset', b.asset, 50),
          amount_raw: b.amount_raw,
          asset_decimals: b.asset_decimals,
        },
        { kind: 'gig_draft', id: null },
      )
      return {
        decision: verdict.decision,
        reasons: verdict.reasons,
        cached: verdict.cached,
      }
    },
  )
}

export default route
