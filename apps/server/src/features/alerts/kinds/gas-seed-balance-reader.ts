/**
 * The LIVE funder-balance reader behind the gas-seed low-balance alert.
 *
 * Its own module so `resolve-alert` can wire the real one while the resolver
 * stays a pure function of an injected reader — and so the single import of the
 * gas-seed feature from inside alerts sits in ONE named place, which is what
 * the seed's removal recipe points at.
 */

import { gasSeedFunders, type GasSeedFunder } from '@server/features/gas-seed'

/**
 * What a chain's seed wallet holds, or null when it cannot be read — over any
 * funder map. The pure half; `seededChainBalance` below binds the live one.
 *
 * Null rather than 0n, and the distinction is the whole point: an unreachable
 * RPC and an empty wallet call for different actions, and only one of them is
 * this alert's subject. A funder ABSENT from the map means the chain configured
 * no seed key — also unreadable rather than empty, since there is no wallet.
 */
export async function seededChainBalanceFrom(
  funders: ReadonlyMap<string, GasSeedFunder>,
  chain_id: string,
): Promise<bigint | null> {
  const funder = funders.get(chain_id)
  if (funder === undefined) return null
  try {
    // `try`/`await`, NOT `.catch()`. `balance()` is typed as returning a
    // promise, but a throw before its first await is SYNCHRONOUS, and a
    // trailing `.catch()` never sees one — the exception escapes past this
    // adapter to a caller expecting a value. Written that way once; the test
    // for it failed immediately.
    return await funder.balance()
  } catch {
    // Swallowed on purpose, and this is the ONLY place it is: a failed read
    // means "could not read", which is what null says. The caller
    // (`seedStanding`) turns that into a retryable SeedBalanceUnreadableError,
    // and rethrowing here would skip that translation and reach `deliverAlert`
    // as a raw failure instead.
    return null
  }
}

/**
 * The live reader `resolve-alert` and the monitor are wired with.
 *
 * `gasSeedFunders()` rather than building a map here: it is the process-wide
 * one the claim surface already reads. Building a second would mean a second
 * set of RPC clients per chain — rebuilt on every tick and every delivery — and
 * a second balance-cache TTL, so the monitor and the availability endpoint
 * could report different balances for the same wallet at the same moment.
 */
export function seededChainBalance(chain_id: string): Promise<bigint | null> {
  return seededChainBalanceFrom(gasSeedFunders(), chain_id)
}
