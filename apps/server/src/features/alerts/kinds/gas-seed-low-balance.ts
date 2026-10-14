/**
 * The gas-seed low-balance alert (#53b item 4) — what "low" means, and the one
 * read that both deciding and reporting go through.
 *
 * Nothing monitored the hot wallets before this. `getBalance` appeared only
 * inside one-off verify scripts, so a seed wallet emptying was discovered by a
 * user's claim failing — which is the one moment it must not be discovered.
 *
 * TWO CALLERS, ONE READ. The monitor (../monitors/gas-seed-balance) asks
 * `seedStanding` whether a chain is low enough to alert; the resolver asks it
 * again, at delivery, for the numbers a channel renders. Deliberately not one
 * reading passed on the queued ref: a balance taken at enqueue is already stale
 * when a human reads the notice, and two numbers for one fact is one too many.
 * Deliberately not two queries either — a monitor and a channel disagreeing
 * about what a wallet holds is the failure this shape rules out.
 */

import { and, eq, isNotNull } from 'drizzle-orm'
import { chains } from '@tenda/shared/db/schema/chains'
import type { AppDatabase } from '@server/plugins/db'
import type { AlertOf, AlertRefOf } from '../types'

/**
 * Reads one chain's funder balance, or null when it CANNOT be read.
 *
 * Injected so nothing here needs an RPC. Null is the reader's way of saying
 * "unreachable" — distinct from 0n, which is a real and alarming reading.
 */
export type FunderBalanceReader = (chain_id: string) => Promise<bigint | null>

/**
 * Thrown when a chain's balance cannot be read at all.
 *
 * A distinct signal from `seedStanding` returning null, and the distinction is
 * load-bearing in TWO places that read it opposite ways:
 *
 *  - `deliverAlert` DROPS a job whose subject resolves to null, on the sound
 *    reasoning that a vanished subject never comes back. Combined with this
 *    alert's chain-keyed dedup and the queue's 24h retention, an RPC blip at
 *    delivery would then silence a draining wallet for a DAY. A throw is that
 *    function's retry signal, which is the correct one for a transient read.
 *  - the monitor catches it per chain and records the chain as unreadable, so
 *    one unreachable RPC costs neither the tick nor the other chains.
 */
export class SeedBalanceUnreadableError extends Error {
  constructor(readonly chain_id: string) {
    super(`gas-seed funder balance unreadable on ${chain_id}`)
    this.name = 'SeedBalanceUnreadableError'
  }
}

/** Everything both callers need about one chain's seed wallet, right now. */
export interface SeedStanding {
  funder_address: string
  balance_raw: string
  grant_raw: string
  grants_remaining: number
}

/**
 * How many whole grants a balance is worth.
 *
 * Floor division, and no rounding up: a wallet holding 1.9 grants can pay ONE
 * user, and telling an operator "2 left" when the second will fail is the
 * failure this alert exists to prevent.
 */
export function grantsRemaining(balance: bigint, grant: bigint): number {
  if (grant <= 0n) return 0
  return Number(balance / grant)
}

/**
 * Every chain carrying a seed today — the monitor's work list.
 *
 * Read from the DB rather than from the manifest because the DB is what the
 * seeder wrote and what the sender pays from: a chain whose columns were
 * cleared has no wallet to warn about, whatever the manifest still declares.
 */
export async function seededChainIds(db: AppDatabase): Promise<string[]> {
  const rows = await db
    .select({ id: chains.id })
    .from(chains)
    .where(
      and(
        eq(chains.is_enabled, true),
        isNotNull(chains.gas_seed_wallet_address),
        isNotNull(chains.gas_seed_amount_raw),
      ),
    )
  return rows.map((r) => r.id)
}

/**
 * One chain's seed standing. TWO failure shapes, and they are not the same:
 *
 * NULL — there is nothing to warn about, permanently. Either the chain was
 * DISABLED (nobody can claim from that wallet) or it stopped carrying a seed
 * (an operator cleared the columns, or a re-seed did). `deliverAlert` DROPS a
 * job that resolves null, which is right: neither state comes back on a retry.
 *
 * THROWS `SeedBalanceUnreadableError` — the balance could not be read. That is
 * transient and a retry may fix it, so it must NOT be null; see the error's own
 * comment for what dropping it would cost. Reporting an unreachable RPC as an
 * empty wallet would also page an operator to top up a wallet that is fine, and
 * the remedy for the real problem is not a transfer.
 *
 * The `is_enabled` clause matches `seededChainIds` ON PURPOSE. The monitor
 * skips a disabled chain, and this runs LATER, at delivery — so without it a
 * chain switched off inside the alert's 24h dedup window would still render a
 * notice about a wallet nobody can claim from. Two definitions of "carries a
 * seed" is how the decision and the message come to disagree.
 */
export async function seedStanding(
  db: AppDatabase,
  readBalance: FunderBalanceReader,
  chain_id: string,
): Promise<SeedStanding | null> {
  const [row] = await db
    .select({
      funder: chains.gas_seed_wallet_address,
      amount: chains.gas_seed_amount_raw,
    })
    .from(chains)
    .where(and(eq(chains.id, chain_id), eq(chains.is_enabled, true)))

  if (row === undefined || row.funder === null || row.amount === null) return null

  const balance = await readBalance(chain_id)
  // NOT null: see SeedBalanceUnreadableError. Returning null here would tell
  // `deliverAlert` the wallet no longer exists, and it would drop the job.
  if (balance === null) throw new SeedBalanceUnreadableError(chain_id)

  return {
    funder_address: row.funder,
    balance_raw: balance.toString(),
    grant_raw: row.amount,
    grants_remaining: grantsRemaining(balance, BigInt(row.amount)),
  }
}

/**
 * The resolver: the queued ref names a chain, this says what is true of it now.
 *
 * Inherits `seedStanding`'s two shapes exactly, and that is the whole reason it
 * is a one-liner: null for a chain that is disabled or no longer seeded (the
 * job is dropped, correctly — no retry brings either back), and a throw for a
 * balance it could not read (the job is retried).
 */
export function resolveGasSeedLowBalance(readBalance: FunderBalanceReader) {
  return async (
    db: AppDatabase,
    ref: AlertRefOf<'gas-seed.low-balance'>,
  ): Promise<AlertOf<'gas-seed.low-balance'> | null> => {
    const standing = await seedStanding(db, readBalance, ref.chain_id)
    return standing === null ? null : { ...ref, ...standing }
  }
}
