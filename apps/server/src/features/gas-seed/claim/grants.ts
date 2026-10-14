/**
 * The gas grant's storage and the contract a chain must satisfy to pay one.
 *
 * WHAT CHANGED AT #58, because the shape of this file is the fix. It used to
 * also hold `dispatchGasSeeds`, an orchestrator that claimed a slot, called
 * `sender.send()` — which broadcast AND waited for confirmation — and then
 * stamped the result. That single call was the defect: confirmation is not
 * something a function return value can express honestly, so a wait that timed
 * out had to be read as either success or failure, and both readings lost money
 * in production (a released slot paying a user twice on Solana, the same shape
 * latent on EVM). It was also DEAD — #53c-2 removed the auto-send path and
 * `claim/job.ts` drives the store and the sender directly, so nothing in `src/`
 * had called it since; the type checker confirms it.
 *
 * Paying is now THREE steps with durable state between them, and a queue between
 * the second and the third: `sign` produces a transaction and its final
 * reference without broadcasting, the caller records that reference, and
 * `checkStatus` later asks the chain what became of it. Nothing infers an
 * outcome from a timeout, because nothing has to.
 */

import { and, eq } from 'drizzle-orm'
import { chains } from '@tenda/shared/db/schema/chains'
import { gas_grants } from '@tenda/shared/db/schema/gas-seed'
import type { ChainNamespace } from '@tenda/shared/db/schema/chains'
import type { GasGrantStatus } from '@tenda/shared'
import { resolvePrimaryWalletAddress } from '@server/lib/auth/resolver'
import type { AppDatabase } from '@server/plugins/db'

// ---------- sender abstraction ------------------------------------------------

/**
 * What the chain says about a transfer we broadcast — three answers, and the
 * middle one is the whole point of the rework.
 *
 *   delivered — the chain confirmed it succeeded. The user has their gas.
 *   failed    — the chain confirmed it FAILED. On EVM a reverted receipt, on
 *               Solana a signature whose status carries an `err`. The money did
 *               not move, so the slot is released and the user may claim again.
 *   pending   — the chain has no answer yet. NOT a failure, and reading it as
 *               one is exactly the bug this replaced. The confirm job retries.
 *
 * A namespace whose transactions EXPIRE may resolve `pending` to `failed` on its
 * own once expiry is provable — see the Solana sender. That decision belongs to
 * the chain leaf that knows its own rules, not to a shared arbiter.
 */
export type GasSeedTransferStatus = 'pending' | 'delivered' | 'failed'

/**
 * A transfer that is SIGNED but not yet on the chain.
 *
 * Two steps rather than one `send()`, and the split is the point: a signed
 * transaction already has its final on-chain reference, so the caller can record
 * that reference BEFORE any money can possibly move. Collapse these back into
 * one call and a crash in the gap leaves a transaction reaching the chain with
 * nothing in the database pointing at it — money gone, unattributable, and the
 * user still marked as owed. That window is small; it is not zero, and this
 * feature's whole history is small windows costing real payments.
 */
export interface SignedGasSeedTransfer {
  /** The reference this transaction WILL carry on chain, derived from its signature. */
  tx_ref: string
  /** Put it on the chain. Returns as soon as the node accepts it — never waits. */
  broadcast(): Promise<void>
}

export interface GasSeedSender {
  /**
   * Sign a transfer of `amount_raw` native units to `to_address`. Contacts the
   * chain for what signing needs (a nonce, a blockhash) but broadcasts nothing.
   */
  sign(args: { to_address: string; amount_raw: string }): Promise<SignedGasSeedTransfer>
  /**
   * What the chain says about `tx_ref` right now.
   *
   * `submitted_at` is when the signed transaction was recorded, and it is here
   * for the one namespace that can use it: a Solana transaction is signed
   * against a blockhash and provably cannot land once that expires, so an
   * absent record plus enough elapsed time IS a definitive failure there. On
   * EVM a transaction is pinned at a nonce and never expires, so the same
   * elapsed time means nothing and that implementation ignores it.
   */
  checkStatus(args: { tx_ref: string; submitted_at: Date }): Promise<GasSeedTransferStatus>
}

// ---------- store abstraction ---------------------------------------------------

/**
 * One grant as the two jobs read it — in ANY status, which is why it is no
 * longer called `ClaimedGrant`: `claimed` became an actual status value at #58,
 * and a type named for one status that routinely carries `submitted`,
 * `delivered` and `unresolved` rows reads as a filter it is not.
 */
export interface GrantForJob {
  status: GasGrantStatus
  tx_ref: string | null
  amount_raw: string
  wallet_address: string | null
  submitted_at: Date | null
}

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
   *
   * The row lands as `claimed` with a NULL tx_ref — nothing has been signed, so
   * there is nothing to reference. That is the state the old `pending:` string
   * placeholder was standing in for.
   */
  claimGrant(row: {
    user_id: string
    chain_id: string
    amount_raw: string
    wallet_address?: string
    funder_address?: string
  }): Promise<boolean>
  /**
   * Record a signed transaction against the slot: `claimed` → `submitted`.
   *
   * THE MOST IMPORTANT WRITE IN THE FEATURE. Until it commits, a transaction may
   * be about to reach the chain with nothing in the database pointing at it; the
   * broadcaster therefore calls this BEFORE it broadcasts. Guarded on the
   * current status so a redelivered job cannot overwrite a reference that a
   * previous attempt already recorded.
   *
   * Returns false when the guard refused, meaning some other attempt got there
   * first and its reference stands.
   */
  markSubmitted(args: {
    user_id: string
    chain_id: string
    tx_ref: string
    submitted_at: Date
  }): Promise<boolean>
  /**
   * Record the chain's confirmation: `submitted` → `delivered`.
   *
   * Status-guarded like the two transitions around it, and the guard is the
   * point rather than ceremony: unguarded, a caller holding a `claimed` grant —
   * one for which nothing was ever signed — could stamp its owner as paid, and
   * the (user_id, chain_id) primary key makes that permanent. Only a slot with a
   * transaction to confirm may be confirmed.
   */
  markDelivered(user_id: string, chain_id: string): Promise<void>
  /**
   * Stop asking: `submitted` → `unresolved`.
   *
   * Keeps the slot, on purpose. The transfer's fate is unknown, and a user who
   * may already hold their seed must not be handed a second one — see
   * GAS_GRANT_STATUSES. This is the row `verify:gas-seed` exists to surface.
   */
  markUnresolved(user_id: string, chain_id: string): Promise<void>
  /**
   * Roll back a claimed slot so the user can claim again.
   *
   * Safe ONLY where the money provably did not move: before a broadcast, or
   * after the chain has attested a failure. A release on an unresolved transfer
   * is how a user gets paid twice.
   */
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
    async markSubmitted({ user_id, chain_id, tx_ref, submitted_at }) {
      // Status-guarded, and the guard is what makes a redelivered broadcast job
      // safe: only a slot that is still `claimed` accepts a reference, so a
      // second attempt cannot replace the hash of a transfer already in flight.
      const updated = await db
        .update(gas_grants)
        .set({ status: 'submitted', tx_ref, submitted_at })
        .where(
          and(
            eq(gas_grants.user_id, user_id),
            eq(gas_grants.chain_id, chain_id),
            eq(gas_grants.status, 'claimed'),
          ),
        )
        .returning({ user_id: gas_grants.user_id })
      return updated.length > 0
    },
    async markDelivered(user_id, chain_id) {
      await db
        .update(gas_grants)
        .set({ status: 'delivered' })
        .where(
          and(
            eq(gas_grants.user_id, user_id),
            eq(gas_grants.chain_id, chain_id),
            eq(gas_grants.status, 'submitted'),
          ),
        )
    },
    async markUnresolved(user_id, chain_id) {
      // Guarded on `submitted` so a confirmation racing a delivery cannot pull a
      // stamped grant back into "we do not know".
      await db
        .update(gas_grants)
        .set({ status: 'unresolved' })
        .where(
          and(
            eq(gas_grants.user_id, user_id),
            eq(gas_grants.chain_id, chain_id),
            eq(gas_grants.status, 'submitted'),
          ),
        )
    },
    async releaseGrant(user_id, chain_id) {
      await db
        .delete(gas_grants)
        .where(and(eq(gas_grants.user_id, user_id), eq(gas_grants.chain_id, chain_id)))
    },
  }
}


