import { MAX_PAGINATION_LIMIT } from '@tenda/shared'

/**
 * Clamp client-supplied pagination to safe SQL bounds. A negative/NaN value
 * otherwise flows straight into LIMIT/OFFSET: a negative OFFSET makes
 * postgres throw (→ 500 on malformed input), and a negative/NaN LIMIT leaks
 * into the response contract. limit ∈ [1, MAX], offset ∈ [0, ∞). The caller's
 * destructure default still supplies the value for an omitted param, these
 * only guard out-of-range/garbage input.
 */
export function clampLimit(limit: number): number {
  return Number.isFinite(limit) ? Math.min(Math.max(Math.trunc(limit), 1), MAX_PAGINATION_LIMIT) : 1
}

export function clampOffset(offset: number): number {
  return Number.isFinite(offset) ? Math.max(Math.trunc(offset), 0) : 0
}
