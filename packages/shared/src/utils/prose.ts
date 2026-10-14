/**
 * "a" / "a and b" / "a, b and c" — the one list-to-sentence rule the product
 * uses, so a DERIVED list reads as English wherever it lands in copy.
 *
 * Moved here from `apps/tendahq/src/lib/prose.ts` when the shared support
 * content became its second consumer: the chain list on the support pages is
 * derived from CHAIN_MANIFEST exactly as the landing's is, and two joiners
 * would let one surface say "Celo, Base, 0G and Solana" while the other said
 * "Celo, Base, 0G, Solana". It was already written to be the ONE rule — three
 * content modules had grown their own copy before it existed.
 */
export function prose(items: readonly string[]): string {
  if (items.length === 0) return ''
  if (items.length === 1) return items[0]
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}
