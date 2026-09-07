/**
 * Sponsored-tx reservation. See stage-0 § Sponsored-tx reservation pattern.
 *
 * Three chain-policy paths (locked decision #11 + § Sponsored-tx):
 *   - **Solana**: never sponsored via this module. Gas comes from the
 *     first-link SOL seed (`gas_grants`, one-time grant), then user-paid.
 *   - **BASE / Base-Sepolia**: routed through Coinbase Paymaster (Stage 3).
 *     This module reserves a sponsorship slot from `users.sponsored_tx_remaining`.
 *   - **CELO / Celo-Sepolia**: gas paid in USDC via the `feeCurrency` adapter
 *     (Stage 4). Bypasses this module entirely, counter never decremented.
 *
 * Atomicity: `tryReserve` is a single
 *   `UPDATE users SET sponsored_tx_remaining = sponsored_tx_remaining - 1
 *    WHERE id = $1 AND sponsored_tx_remaining > 0 RETURNING ...`
 * so N parallel reserves across the same user resolve to MIN(N, slots-available)
 * successes, no over-spend race.
 *
 * Reservation lifecycle invariant (caller's responsibility): every successful
 * reservation MUST be followed by exactly one of `releaseSponsoredTx` or
 * `commitSponsoredTx`. `commit` is a no-op for the paymaster pattern (the
 * decrement WAS the commit); `release` increments back. Calling release
 * twice over-credits the user. A reconciliation cron (Stage 2+) compares
 * counter state against confirmed sponsored `tx_attempts` and fixes drift.
 *
 * Runtime caveat: depends on the v2 `users.sponsored_tx_remaining` column.
 * Type-correct + unit-tested today; runs against a live DB once Stage 0
 * cutover migration ships.
 */

import { randomUUID } from 'node:crypto'
import { and, eq, gt, sql } from 'drizzle-orm'
import { users } from '@tenda/shared/db/schema'
import { CHAIN_MANIFEST } from '@tenda/shared'
import type { ChainId } from '@server/chains/types'
import type { AppDatabase } from '@server/plugins/db'

/**
 * Chains whose unsigned-tx build path goes through this module's reservation
 * pattern. Other chains return `{ sponsored: false }` without touching the
 * counter. Derived from the manifest's `gasPolicy: 'paymaster'` entries, the
 * single source, so a new paymaster chain becomes sponsorship-eligible by
 * adding its manifest entry, with no edit here.
 */
const PAYMASTER_MANAGED_CHAINS: ReadonlySet<ChainId> = new Set(
  CHAIN_MANIFEST.filter((c) => c.gasPolicy === 'paymaster').map((c) => c.id),
)

/**
 * Discriminated so `reservation_id` is only accessible after the
 * `sponsored: true` check, release/commit can't be called on an unsponsored
 * result by accident.
 */
export type ReservationResult =
  | { sponsored: false }
  | {
      sponsored: true
      /**
       * Opaque token returned for caller symmetry, NOT validated against
       * any DB row. Each successful reservation MUST be released or
       * committed exactly once (caller responsibility, see file header).
       */
      reservation_id: string
    }

// ---------- store abstraction --------------------------------------------

/** Decoupled DB surface so unit tests can use an in-memory implementation. */
export interface SponsorStore {
  /** Atomic decrement-if-positive. Returns true on success. */
  tryReserve(user_id: string): Promise<boolean>
  /** Atomic increment. No-cap (caller invariant prevents over-credit). */
  refund(user_id: string): Promise<void>
}

// ---------- public API ---------------------------------------------------

export async function reserveSponsoredTx(
  store: SponsorStore,
  args: { user_id: string; chain_id: ChainId },
): Promise<ReservationResult> {
  if (!PAYMASTER_MANAGED_CHAINS.has(args.chain_id)) return { sponsored: false }
  const ok = await store.tryReserve(args.user_id)
  if (!ok) return { sponsored: false }
  return { sponsored: true, reservation_id: randomUUID() }
}

export async function releaseSponsoredTx(
  store: SponsorStore,
  args: { user_id: string },
): Promise<void> {
  // The paymaster quota is a per-user counter (not a per-reservation row),
  // so a release is simply "give the slot back to this user". The opaque
  // reservation_id from reserve is for the Stage-3 per-attempt tracking
  // (#45), not needed to release.
  await store.refund(args.user_id)
}

/** No-op for the paymaster model, the decrement at reserve time IS the commit. */
export async function commitSponsoredTx(
  _store: SponsorStore,
  args: { user_id: string },
): Promise<void> {
  void args
}

// ---------- Drizzle-backed store ----------------------------------------

export function drizzleSponsorStore(db: AppDatabase): SponsorStore {
  return {
    async tryReserve(user_id) {
      const result = await db
        .update(users)
        .set({ sponsored_tx_remaining: sql`${users.sponsored_tx_remaining} - 1` })
        .where(and(eq(users.id, user_id), gt(users.sponsored_tx_remaining, 0)))
        .returning({ id: users.id })
      return result.length === 1
    },

    async refund(user_id) {
      await db
        .update(users)
        .set({ sponsored_tx_remaining: sql`${users.sponsored_tx_remaining} + 1` })
        .where(eq(users.id, user_id))
    },
  }
}
