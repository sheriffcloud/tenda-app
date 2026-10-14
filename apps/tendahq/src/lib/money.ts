/**
 * A display amount at two decimals — "12" → "12.00", "11.7" → "11.70".
 *
 * Mobile's MoneyText prints every USDC figure at two decimals, and the
 * Paper Landing's receipt reads "12.00" beside the "0.30" and "11.70" it
 * derives. `FEE_EXAMPLE` keeps the bare form because tests do arithmetic on
 * it; this is for the surfaces that show it as money.
 */
export function money2(amount: string | number): string {
  const n = Number(amount)
  return Number.isFinite(n) ? n.toFixed(2) : String(amount)
}
