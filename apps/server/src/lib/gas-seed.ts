/**
 * First-link native-gas seed (stage-1-onboarding.md, decision #16):
 * phone-verified users with a wallet on a seed-bearing chain receive a
 * one-time native-token grant. Chain-driven, a chain qualifies iff
 * `chains.gas_seed_amount_raw IS NOT NULL`; adding a future chain is a DB
 * row + env var, no code change.
 *
 * Idempotency: `gas_grants` PK (user_id, chain_id) + insert-before-send.
 * The grant row is claimed FIRST with a placeholder tx_ref; only the
 * claimer performs the transfer, then stamps the real tx_ref. A concurrent
 * duplicate call loses the insert race and exits, the hot wallet can
 * never double-pay one user on one chain.
 *
 * The transfer itself is behind `GasSeedSender` so tests run offline and
 * the Solana impl stays a leaf.
 */

import { and, eq } from 'drizzle-orm'
import { chains } from '@tenda/shared/db/schema/chains'
import { gas_grants, user_wallets } from '@tenda/shared/db/schema/identity'
import type { ChainNamespace } from '@tenda/shared/db/schema/chains'
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
  /** The user's wallet address on the namespace, or null. */
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
    async findWalletAddress(user_id, namespace) {
      const rows = await db
        .select({ address: user_wallets.address })
        .from(user_wallets)
        .where(and(eq(user_wallets.user_id, user_id), eq(user_wallets.chain_ns, namespace)))
        .limit(1)
      return rows[0]?.address ?? null
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
  /** Sender per namespace. Missing namespace = key not configured → skip. */
  senders: Partial<Record<ChainNamespace, GasSeedSender>>
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
    const sender = deps.senders[chain.namespace]
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

    try {
      const { tx_ref } = await sender.send({
        to_address: address,
        amount_raw: chain.gas_seed_amount_raw,
      })
      await deps.store.finalizeGrant(user_id, chain.chain_id, tx_ref)
      result.granted.push({ chain_id: chain.chain_id, tx_ref })
      deps.log.info({ user_id, chain_id: chain.chain_id, tx_ref }, 'gas seed granted')
    } catch (err) {
      // Transfer failed, release the slot so a later attempt can retry.
      await deps.store.releaseGrant(user_id, chain.chain_id)
      result.skipped.push({ chain_id: chain.chain_id, reason: 'transfer failed' })
      deps.log.warn({ err, user_id, chain_id: chain.chain_id }, 'gas seed transfer failed')
    }
  }
  return result
}
