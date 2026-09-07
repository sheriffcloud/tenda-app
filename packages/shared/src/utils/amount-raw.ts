const CANONICAL_AMOUNT_RAW = /^(0|[1-9]\d*)$/

/** Non-negative base-unit integer string with no sign, whitespace, or leading zeros. */
export function isAmountRaw(value: unknown): value is string {
  return typeof value === 'string' && CANONICAL_AMOUNT_RAW.test(value)
}
