/**
 * Base-unit amounts are integers that routinely exceed Number.MAX_SAFE_INTEGER
 * (1 ETH = 1e18), so every comparison between them must be BigInt-exact. But
 * `BigInt()` THROWS on anything it can't parse — NaN, Infinity, '12.5', '' —
 * which turns a bad amount into a crash at the call site. Balance checks are
 * advisory: a budget we can't parse must read as "no answer", never as a
 * thrown render.
 */

/**
 * A base-unit amount as BigInt, or null when it isn't a valid integer amount.
 * Accepts the string form (raw amounts on the wire) and the number form (the
 * gig form's `paymentRaw`), truncating a fractional number rather than
 * rejecting it — base units have no sub-unit precision to preserve.
 */
export function toBigIntOrNull(raw: string | number): bigint | null {
  // BigInt('') and BigInt('  ') are 0n, not an error — a JS footgun that would
  // turn an ABSENT amount into a confident zero, the exact conflation this
  // module exists to prevent. Reject blank input before it reaches BigInt.
  if (typeof raw === 'string' && raw.trim() === '') return null
  try {
    return BigInt(typeof raw === 'number' ? Math.trunc(raw) : raw)
  } catch {
    // NaN / Infinity / non-integer strings — unknown, not zero.
    return null
  }
}
