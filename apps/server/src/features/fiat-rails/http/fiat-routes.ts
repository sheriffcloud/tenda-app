/**
 * Shared helpers for the /v1/fiat/* route surface: the feature gate and
 * defensive body narrowing (no schema compiler on these routes yet).
 */

import type { FastifyRequest, FastifyReply } from 'fastify'
import { ErrorCode } from '@tenda/shared'
import { AppError } from '@server/lib/errors'
import { getConfig } from '@server/config'

/** preHandler: FIAT_RAILS_ENABLED=false → 503 on the whole surface. */
export async function requireFiatRails(_request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  if (!getConfig().FIAT_RAILS_ENABLED) {
    throw new AppError(503, ErrorCode.FIAT_RAILS_DISABLED, 'fiat rails are disabled')
  }
}

export function requireStr(field: string, v: unknown, max = 200): string {
  if (typeof v !== 'string' || v.length === 0 || v.length > max) {
    throw new AppError(422, ErrorCode.VALIDATION_ERROR, `${field} must be a 1–${max} char string`)
  }
  return v
}

export function optionalStr(field: string, v: unknown, max = 200): string | undefined {
  if (v === undefined || v === null) return undefined
  return requireStr(field, v, max)
}
