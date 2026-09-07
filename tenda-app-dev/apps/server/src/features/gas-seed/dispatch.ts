/**
 * First-link native-gas seed (stage-1-onboarding.md, decision #16):
 * phone-verified users with a wallet on a seed-bearing chain receive a
 * one-time native-token grant. Chain-driven, a chain qualifies iff
 * `chains.gas_seed_amount_raw IS NOT NULL` — which db:seed writes from the
 * manifest's `gasSeedAmountRaw` — so adding a future chain is a manifest
 * entry + its env secrets + a re-seed, with no code change here, for any
 * namespace ./senders supports (since #53a, both of them).
 *
 * Idempotency: `gas_grants` PK (user_id, chain_id) + insert-before-send.
 * The grant row is claimed FIRST with a placeholder tx_ref; only the
 * claimer performs the transfer, then stamps the real tx_ref. CONCURRENT
 * calls therefore cannot double-pay: the loser of the insert race exits
 * without transferring.
 *
 * What that does NOT cover is a transfer whose OUTCOME is unknown. A sender
 * that throws — including on a receipt timeout — releases the slot so the
 * user is not permanently marked seeded for a transfer that never landed,
 * and a tx that lands after that release would be paid a second time. The
 * senders bound that window rather than eliminating it (see the receipt wait
 * in ./senders/evm.ts); the alternative, keeping the slot, strands the user
 * instead. Losing one seed to a slow chain is the cheaper failure.
 *
 * The transfer itself is behind `GasSeedSender` so tests run offline and
 * each chain's impl stays a leaf.
 */

import { and, eq } from 'drizzle-orm'
import { chains } from '@tenda/shared/db/schema/chains'
import { gas_grants } from '@tenda/shared/db/schema/identity'
import type { ChainNamespace } from '@tenda/shared/db/schema/chains'
import { resolvePrimaryWalletAddress } from '@server/lib/auth/resolver'
import type { AppDatabase } from '@server/plugins/db'

// ---------- sender abstraction ------------------------------------------------

export interface GasSeedSender {
  /** Transfer `amount_raw` native units to `address`; returns the tx_ref. */
  send(args: { to_address: string; amount_raw: string }): Promise<{ tx_ref: string }>
}

// ---------- store abstraction ---------------------------------------------------

export interface SeedableChain {
  chain_id: string
  namespace: ChainNamespace
  gas_seed_amount_raw: string
}

export interface GasSeedStore {
  /** Enabled chains with a configured gas seed. */
  findSeedableChains(): Promise<SeedableChain[]>
  /**
   * The wallet a seed on this namespace must be paid to: the SAME one the tx
   * builders will make the user sign with, or null when they have none there.
   */
  findWalletAddress(user_id: string, namespace: ChainNamespace): Promise<string | null>
  /**
   * Claim the grant slot. Returns false when a grant already exists
   * (PK conflict), the caller must not transfer.
   */
  claimGrant(row: {
    user_id: string
    chain_id: string
    amount_raw: string
    tx_ref: string
  }): Promise<boolean>
  /** Stamp the real tx_ref after the transfer lands. */
  finalizeGrant(user_id: string, chain_id: string, tx_ref: string): Promise<void>
  /** Roll back a claimed slot whose transfer failed. */
  releaseGrant(user_id: string, chain_id: string): Promise<void>
}

export function drizzleGasSeedStore(db: AppDatabase): GasSeedStore {
  return {
    async findSeedableChains() {
      const rows = await db
        .select({
          chain_id: chains.id,
          namespace: chains.namespace,
          gas_seed_amount_raw: chains.gas_seed_amount_raw,
        })
        .from(chains)
        .where(eq(chains.is_enabled, true))
      return rows.flatMap((r) =>
        r.gas_seed_amount_raw === null
          ? []
          : [{ chain_id: r.chain_id, namespace: r.namespace, gas_seed_amount_raw: r.gas_seed_amount_raw }],
      )
    },
    // The BUILDERS' resolver, not a second copy of its query. A user can hold
    // several wallets on one namespace, and this used to take an arbitrary one
    // (`limit(1)`, no ordering) while every transaction the server builds for
    // them resolves the PRIMARY — so the seed could fund a wallet they never
    // sign with, and `gas_grants`' (user_id, chain_id) key makes that the only
    // seed they ever get. resolvePrimaryWalletAddress documents itself as the
    // one definition for exactly this reason; it now has no second copy.
    findWalletAddress(user_id, namespace) {
      return resolvePrimaryWalletAddress(db, user_id, namespace)
    },
    async claimGrant(row) {
      const inserted = await db
        .insert(gas_grants)
        .values(row)
        .onConflictDoNothing({ target: [gas_grants.user_id, gas_grants.chain_id] })
        .returning({ user_id: gas_grants.user_id })
      return inserted.length > 0
    },
    async finalizeGrant(user_id, chain_id, tx_ref) {
      await db
        .update(gas_grants)
        .set({ tx_ref })
        .where(and(eq(gas_grants.user_id, user_id), eq(gas_grants.chain_id, chain_id)))
    },
    async releaseGrant(user_id, chain_id) {
      await db
        .delete(gas_grants)
        .where(and(eq(gas_grants.user_id, user_id), eq(gas_grants.chain_id, chain_id)))
    },
  }
}

// ---------- dispatch -------------------------------------------------------------

export interface GasSeedDeps {
  store: GasSeedStore
  /**
   * Sender per CHAIN ID (built by ./senders). Missing chain = that
   * chain configured no seed key → skip.
   *
   * Per chain rather than per namespace (#53a): a deployment runs one chain
   * per FAMILY, not per namespace, so several EVM chains can be active at
   * once — each with its own RPC, hot wallet and native decimals. A
   * namespace-keyed sender would have had to be one of them, chosen
   * arbitrarily, and would then have paid seeds on the wrong chain.
   */
  senders: ReadonlyMap<string, GasSeedSender>
  log: {
    info(obj: object, msg: string): void
    warn(obj: object, msg: string): void
  }
}

export interface GasSeedResult {
  granted: Array<{ chain_id: string; tx_ref: string }>
  skipped: Array<{ chain_id: string; reason: string }>
}

/**
 * Run the seed check for one user across every seedable chain. Safe to call
 * on every wallet link AND after phone verification (the retroactive path),
 * non-eligible cases exit cheaply, duplicates are blocked by the claim.
 *
 * Caller must have already established phone verification, this function
 * does not re-check it (single responsibility; the routes own eligibility).
 */
export async function dispatchGasSeeds(deps: GasSeedDeps, user_id: string): Promise<GasSeedResult> {
  const result: GasSeedResult = { granted: [], skipped: [] }
  const chains_ = await deps.store.findSeedableChains()

  for (const chain of chains_) {
    const sender = deps.senders.get(chain.chain_id)
    if (sender === undefined) {
      result.skipped.push({ chain_id: chain.chain_id, reason: 'seed wallet key not configured' })
      deps.log.warn({ chain_id: chain.chain_id }, 'gas seed skipped, sender not configured')
      continue
    }
    const address = await deps.store.findWalletAddress(user_id, chain.namespace)
    if (address === null) {
      result.skipped.push({ chain_id: chain.chain_id, reason: 'no wallet on chain' })
      continue
    }

    // Claim first: the placeholder tx_ref must be unique per slot (tx_ref
    // has a UNIQUE constraint), derive it from the PK.
    const placeholder = `pending:${user_id}:${chain.chain_id}`
    const claimed = await deps.store.claimGrant({
      user_id,
      chain_id: chain.chain_id,
      amount_raw: chain.gas_seed_amount_raw,
      tx_ref: placeholder,
    })
    if (!claimed) {
      result.skipped.push({ chain_id: chain.chain_id, reason: 'already granted' })
      continue
    }

    let tx_ref: string
    try {
      ;({ tx_ref } = await sender.send({
        to_address: address,
        amount_raw: chain.gas_seed_amount_raw,
      }))
    } catch (err) {
      // The transfer did not happen: release the slot so a later attempt can
      // retry. ONLY the send is inside this try — see below.
      await deps.store.releaseGrant(user_id, chain.chain_id)
      result.skipped.push({ chain_id: chain.chain_id, reason: 'transfer failed' })
      deps.log.warn({ err, user_id, chain_id: chain.chain_id }, 'gas seed transfer failed')
      continue
    }

    try {
      await deps.store.finalizeGrant(user_id, chain.chain_id, tx_ref)
      result.granted.push({ chain_id: chain.chain_id, tx_ref })
      deps.log.info({ user_id, chain_id: chain.chain_id, tx_ref }, 'gas seed granted')
    } catch (err) {
      // The money HAS left the hot wallet; only the stamp failed. Releasing here
      // — which one shared try/catch used to do — would free the slot and let a
      // later link pay the same user a second time. Keeping the claim means the
      // grant survives as a `pending:` row, which is precisely the state
      // `scripts/verify-gas-seed.ts` reports as "slot claimed but transfer never
      // finalized": visible, repairable, and paid exactly once.
      result.skipped.push({ chain_id: chain.chain_id, reason: 'granted but not recorded' })
      deps.log.warn(
        { err, user_id, chain_id: chain.chain_id, tx_ref },
        'gas seed transferred but the grant could not be stamped — slot deliberately NOT released',
      )
    }
  }
  return result
}
