import type { ChainRegistryEntry } from '@tenda/shared'
import { readAssetBalance } from './read-asset'
import { toBigIntOrNull } from './raw-amount'
import type { AssetBalance } from './types'

/**
 * The most of `assetId` the user could put behind ONE transaction on `chain`:
 * the largest balance held by any of `owners`.
 *
 * A transaction is signed by exactly one wallet, and balances don't combine
 * across wallets — so the spendable amount is the MAXIMUM, never the sum. (The
 * wallet screen's headline sums across wallets and chains on purpose: it
 * answers "what do I own", a different question from "what can this
 * transaction move".)
 *
 * Returns null — UNKNOWN — when `owners` is empty or ANY read fails. A partial
 * answer can't establish a maximum, and under-reporting the maximum is exactly
 * what would tell a funded user they're broke. Unknown is never zero.
 */
export async function readSpendableBalance(
  owners: readonly string[],
  chain: ChainRegistryEntry,
  assetId: string,
): Promise<AssetBalance | null> {
  if (owners.length === 0) return null

  // Parallel: `owners` is one wallet for nearly every user, and reading the few
  // multi-wallet cases concurrently keeps the pre-flight inside one RPC budget
  // instead of N sequential ones.
  const readings = await Promise.all(
    owners.map((owner) => readAssetBalance(owner, chain, assetId).catch(() => null)),
  )

  let best: AssetBalance | null = null
  let bestRaw: bigint | null = null
  for (const reading of readings) {
    if (reading === null) return null // one unreadable wallet ⇒ no maximum
    const amount = toBigIntOrNull(reading.amountRaw)
    if (amount === null) return null // unparseable ⇒ no maximum
    if (bestRaw === null || amount > bestRaw) {
      best = reading
      bestRaw = amount
    }
  }
  return best
}
