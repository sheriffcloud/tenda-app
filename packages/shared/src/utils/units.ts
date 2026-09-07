/**
 * Decimal ↔ base-unit conversion, BigInt-exact. The ONLY safe way to move
 * between a user-facing amount and an on-chain raw amount: JS `Number` loses
 * precision above 2^53 (≈9.007e15), so `amount * 10 ** decimals` silently
 * corrupts any 18-decimal asset (1 ETH = 1e18 base units). Every raw amount
 * that reaches a contract MUST be produced here, never by float math.
 */

/**
 * User-typed decimal amount → base units ('12.5', 6 → '12500000').
 * Returns null on anything that isn't a plain non-negative decimal, or whose
 * fractional part exceeds the asset's precision (callers surface it as invalid
 * input). Does NOT cap the magnitude — chain-specific ceilings (EVM uint256,
 * Solana u64, the escrow numeric(78,0)) are the caller's concern.
 */
export function parseUnits(display: string, decimals: number): string | null {
  const match = /^(\d+)(?:\.(\d+))?$/.exec(display.trim())
  if (match === null) return null
  const whole = match[1]
  const frac = match[2] ?? ''
  if (frac.length > decimals) return null
  const raw = BigInt(whole) * 10n ** BigInt(decimals) + BigInt(frac.padEnd(decimals, '0') || '0')
  return raw.toString()
}

/**
 * Base units → decimal display string, BigInt-exact ('1500000000000000000',
 * 18 → '1.5'). Trailing zeros are trimmed and whole numbers render without a
 * decimal point. Returns a STRING (not a number) so precision survives; take
 * `Number(formatUnits(...))` only when the resulting magnitude is small (e.g.
 * multiplying a display amount by a fiat rate).
 */
export function formatUnits(raw: string, decimals: number): string {
  const negative = raw.startsWith('-')
  const digits = negative ? raw.slice(1) : raw
  const value = BigInt(digits)
  const base = 10n ** BigInt(decimals)
  const whole = value / base
  const frac = value % base
  const sign = negative && value !== 0n ? '-' : ''
  if (frac === 0n) return `${sign}${whole.toString()}`
  const fracStr = frac.toString().padStart(decimals, '0').replace(/0+$/, '')
  return `${sign}${whole.toString()}.${fracStr}`
}
