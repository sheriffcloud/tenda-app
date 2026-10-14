/**
 * The canonical base-unit amount: a non-negative decimal integer with no sign,
 * whitespace or leading zeros. Exported as the PATTERN as well as the guard so
 * a contract that publishes the shape (the Agent API document) states the
 * same rule the validators enforce.
 */
export const AMOUNT_RAW_PATTERN = /^(0|[1-9]\d*)$/

/** Non-negative base-unit integer string with no sign, whitespace, or leading zeros. */
export function isAmountRaw(value: unknown): value is string {
  return typeof value === 'string' && AMOUNT_RAW_PATTERN.test(value)
}
