/**
 * The reads the claim decision needs that `GasSeedStore` does not already do —
 * who the claimant is, whether they already hold a grant, and whether an
 * operator has switched this chain's claims off.
 *
 * Split from `GasSeedStore` (../grants) rather than bolted onto it because they
 * are used by different callers: the jobs that sign, broadcast and confirm never
 * ask about device tokens or account status, and widening the write store's
 * interface would make every one of its test doubles implement reads it never
 * performs.
 */

import { and, eq, isNotNull, sql } from 'drizzle-orm'
import { device_tokens, user_identities, users } from '@tenda/shared/db/schema'
import { gas_grants, gas_seed_settings } from '@tenda/shared/db/schema/gas-seed'
import type { AppDatabase } from '@server/plugins/db'
import type { GrantForJob } from './grants'
import type { ClaimantFacts, GrantFacts } from './eligibility'

export interface GasSeedClaimStore {
  /** Everything about the claimant the decision needs, read fresh. */
  claimantFacts(user_id: string): Promise<ClaimantFacts>
  /** This user's grant on this chain, or null. */
  findGrant(user_id: string, chain_id: string): Promise<GrantFacts | null>
  /**
   * The grant as the JOBS need it: where it is, what was promised, and to which
   * wallet.
   *
   * NOT `findClaimedGrant`, which is what this was called until `claimed` became
   * an actual status value (#58). A method named for one status that routinely
   * returns `submitted` and `unresolved` rows reads as a filter it is not.
   *
   * Read from the grant row rather than re-derived from config, because the jobs
   * run after the claim and both could have moved: an operator may have
   * re-seeded a different amount, and the user may have linked another wallet.
   * The row records what they were promised, and that is what gets paid.
   *
   * Carries the STATUS and `submitted_at` since #58: the broadcast job needs to
   * know whether a transaction already exists for this slot (signing a second
   * one would put two transfers on the chain for one grant), and the confirm job
   * needs to know when the first was recorded.
   */
  findGrantForJob(user_id: string, chain_id: string): Promise<GrantForJob | null>
  /**
   * Chains whose claims an operator has switched OFF.
   *
   * The negative set, not the positive one: an absent row means enabled, so a
   * newly seedable chain needs no row and the table only ever holds exceptions.
   */
  disabledChains(): Promise<ReadonlySet<string>>
}

export function drizzleGasSeedClaimStore(db: AppDatabase): GasSeedClaimStore {
  return {
    async claimantFacts(user_id) {
      // Three reads in parallel rather than a single join: they touch three
      // unrelated tables, and a join would make the whole thing miss when any
      // one of them has no row (a user with no device token has no
      // device_tokens row at all).
      const [account, devices, phones] = await Promise.all([
        db
          .select({ status: users.status, is_agent: users.is_agent })
          .from(users)
          .where(eq(users.id, user_id))
          .limit(1),
        db
          .select({ one: sql<number>`1` })
          .from(device_tokens)
          .where(eq(device_tokens.user_id, user_id))
          .limit(1),
        db
          .select({ one: sql<number>`1` })
          .from(user_identities)
          .where(
            and(
              eq(user_identities.user_id, user_id),
              eq(user_identities.kind, 'phone'),
              isNotNull(user_identities.verified_at),
            ),
          )
          .limit(1),
      ])
      return {
        // The client stamp is a property of the SESSION, not of the account, so
        // it is supplied by the caller from the token rather than read here.
        client: null,
        has_device_token: devices.length > 0,
        has_verified_phone: phones.length > 0,
        // A missing user row reads as suspended, not as active. This runs on a
        // payout path; "the account could not be found" must never resolve to
        // "so go ahead". (It is unreachable through the route — `authenticate`
        // has already resolved the token — but the store is callable elsewhere.)
        is_suspended: account[0]?.status !== 'active',
        is_agent: account[0]?.is_agent === true,
      }
    },

    async findGrant(user_id, chain_id) {
      const rows = await db
        .select({ status: gas_grants.status })
        .from(gas_grants)
        .where(and(eq(gas_grants.user_id, user_id), eq(gas_grants.chain_id, chain_id)))
        .limit(1)
      const row = rows[0]
      return row === undefined ? null : { status: row.status }
    },

    async findGrantForJob(user_id, chain_id) {
      const rows = await db
        .select({
          status: gas_grants.status,
          tx_ref: gas_grants.tx_ref,
          amount_raw: gas_grants.amount_raw,
          wallet_address: gas_grants.wallet_address,
          submitted_at: gas_grants.submitted_at,
        })
        .from(gas_grants)
        .where(and(eq(gas_grants.user_id, user_id), eq(gas_grants.chain_id, chain_id)))
        .limit(1)
      return rows[0] ?? null
    },

    async disabledChains() {
      const rows = await db
        .select({ chain_id: gas_seed_settings.chain_id })
        .from(gas_seed_settings)
        .where(eq(gas_seed_settings.claims_enabled, false))
      return new Set(rows.map((r) => r.chain_id))
    },
  }
}
