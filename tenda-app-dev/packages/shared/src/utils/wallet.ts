/**
 * Truncate a Solana wallet address for display.
 *
 *   "9xQpFv7c…3hYz"  ← truncateWallet('9xQpFv7c1m...3hYz', 4, 4)
 *
 * Returns the address unchanged if it's already shorter than `prefix + suffix`.
 */
export function truncateWallet(address: string, prefix = 4, suffix = 4): string {
  if (!address) return ''
  if (address.length <= prefix + suffix) return address
  return `${address.slice(0, prefix)}…${address.slice(-suffix)}`
}
