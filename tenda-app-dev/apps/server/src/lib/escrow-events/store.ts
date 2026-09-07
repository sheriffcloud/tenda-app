/**
 * Escrow-event store seam + drizzle impl (co-located per the lib convention).
 * The apply is ATOMIC: the status-guarded `escrows` UPDATE, the
 * `escrow_transactions` audit INSERT, and (for DisputeResolved) the `disputes`
 * stamp all commit inside ONE db.transaction, load-bearing because verify-tx's
 * `isProcessed` dedup keys on the audit row, so the transition and that row must
 * never split across commits.
 */

import { and, eq, inArray } from 'drizzle-orm'
import type { ChainNamespace } from '@tenda/shared/db/schema/chains'
import type { EscrowTxType } from '@tenda/shared'
import { escrows, escrow_transactions } from '@tenda/shared/db/schema/escrow'
import { disputes, dispute_resolutions } from '@tenda/shared/db/schema/governance'
import { user_wallets } from '@tenda/shared/db/schema/identity'
import { walletAddressEquals } from '@server/lib/auth/wallet-address'
import type { AppDatabase } from '@server/plugins/db'
import type { EscrowStatus } from '@server/lib/escrow'
import { revertAssignmentCycle, settleAssignedApplication } from './application-cycle'

/** Column patch applied alongside the status guard. */
export interface EscrowPatch {
  status?: EscrowStatus
  escrow_ref?: string
  /**
   * Stamped by `EscrowCreated` from the contract that emitted it. Write-once in
   * practice — the create event lands once per escrow — and the value the whole
   * build path later routes by (open_issues #89).
   */
  escrow_contract?: string
  counterparty_id?: string | null
  assigned_counterparty_id?: string | null
  /**
   * Chain-attested from the EscrowCreated event's `creator` field —
   * write-once in practice, like `escrow_contract`.
   */
  creator_address?: string | null
  /**
   * Rides the SAME install/release lifecycle as `counterparty_id`, in the
   * same patch, so the id and its wallet can never disagree.
   */
  counterparty_address?: string | null
  /** Cleared with `assigned_counterparty_id` (decline); Solana's create
   *  event re-attests it, the EVM create event carries no assignee. */
  assigned_counterparty_address?: string | null
  /**
   * `null` CLEARS the column — AssignmentReleased rewinds an escrow to `open`
   * and its completion deadline must go with it, or the expiry sweep would
   * keep judging an escrow nobody is working on against a dead deadline.
   */
  completion_deadline?: Date | null
  submitted_at?: Date
  approval_deadline?: Date
  /**
   * Cleared by AssignmentReleased. Cycle-scoped, not escrow-scoped: left
   * behind it made the NEXT worker's assignment read as already-released —
   * the poster kept seeing "your worker said they are not available", the new
   * worker never got the release exit at all, the gig stopped counting
   * against their active-gig cap, and their abandonment strike was suppressed
   * for good.
   */
  assignment_released_at?: Date | null
  /** Cleared with it, for the same reason: it describes one cycle's assign. */
  assigned_from_application?: boolean
}

/** Audit row recorded alongside every applied transition. */
export interface EscrowEventTransaction {
  type: EscrowTxType
  tx_ref: string
  amount_raw: string | null
  platform_fee_raw: string | null
  /** Resolve rows only: the creator's principal share (see schema note). */
  creator_payout_raw: string | null
  actor_id: string | null
}

/** What one atomic apply did, beyond moving the row. */
export interface ApplyEventOutcome {
  /**
   * False when the status guard tripped (another worker already applied); the
   * caller treats that as an idempotent no-op, and neither the audit row nor
   * the dispute stamp was written.
   */
  applied: boolean
  /**
   * Applicants this transition auto-resolved to `passed` (D4). Carried out for
   * the same reason `counterparty_id` is: once committed, nothing downstream
   * can tell WHICH rows this commit settled apart from ones an earlier
   * assign/unassign cycle settled — re-reading would notify people twice.
   */
  passed_applicant_ids: string[]
  /**
   * Applicants an `unassign` put back in the running. Carried out for exactly
   * the same reason as `passed_applicant_ids`: after the commit they are
   * indistinguishable from applicants who never lost in the first place.
   */
  revived_applicant_ids: string[]
}

export interface EscrowEventStore {
  /** Apply one event atomically; see file header and ApplyEventOutcome. */
  applyEvent(args: {
    escrow_id: string
    from: EscrowStatus[]
    patch: EscrowPatch
    transaction: EscrowEventTransaction
    disputeResolution?: { winner: 'creator' | 'counterparty' | 'split' }
    /** Settle this applicant's gig application alongside the transition. */
    application?: { applicant_id: string }
    /** Undo the assignment cycle alongside the transition (unassign). */
    revertApplications?: { now: Date }
  }): Promise<ApplyEventOutcome>
  /** Wallet address → user id on the namespace; null if unknown. */
  resolveUserByWallet(chain_ns: ChainNamespace, address: string): Promise<string | null>
}

export function drizzleEscrowEventStore(db: AppDatabase): EscrowEventStore {
  return {
    async applyEvent({
      escrow_id,
      from,
      patch,
      transaction,
      disputeResolution,
      application,
      revertApplications,
    }) {
      // All writes in ONE transaction so the audit row (which isProcessed
      // keys on) can never be lost relative to the status transition.
      return db.transaction(async (tx) => {
        let passed_applicant_ids: string[] = []
        let revived_applicant_ids: string[] = []
        const updated = await tx
          .update(escrows)
          .set(patch)
          .where(and(eq(escrows.id, escrow_id), inArray(escrows.status, from)))
          // `accept_deadline` rides along because the revert needs it and the
          // row is already being written — a second read could disagree with
          // this one under a concurrent write.
          .returning({ id: escrows.id, accept_deadline: escrows.accept_deadline })
        const row = updated[0]
        // Status guard tripped → idempotent no-op, and nothing was settled.
        if (row === undefined) {
          return { applied: false, passed_applicant_ids, revived_applicant_ids }
        }

        // tx_ref UNIQUE, a replayed insert is a no-op (defence in depth on
        // top of the caller's isProcessed dedup).
        await tx.insert(escrow_transactions).values({ escrow_id, ...transaction }).onConflictDoNothing({
          target: escrow_transactions.tx_ref,
        })

        if (application !== undefined) {
          const settled = await settleAssignedApplication(tx, escrow_id, application.applicant_id)
          passed_applicant_ids = settled.passed_applicant_ids
        }

        if (revertApplications !== undefined) {
          const reverted = await revertAssignmentCycle(tx, escrow_id, {
            accept_deadline: row.accept_deadline,
            now: revertApplications.now,
          })
          revived_applicant_ids = reverted.revived_applicant_ids
        }

        if (disputeResolution !== undefined) {
          // FOR UPDATE, because the proposal is confirmed BEFORE the stamp
          // below and the two must not interleave with a concurrent apply.
          const [target] = await tx
            .select({ id: disputes.id })
            .from(disputes)
            .where(eq(disputes.escrow_id, escrow_id))
            .for('update')
            .limit(1)
          // No dispute row → nothing to stamp, and no proposal to confirm.
          if (target !== undefined) {
            // On-chain finality is the ONLY thing that confirms a proposal
            // (Issue-3): flip the active proposal, if any, in the same commit.
            // A no-op when resolution went through CLI/direct-resolve instead.
            const [confirmed] = await tx
              .update(dispute_resolutions)
              .set({ status: 'confirmed', resolved_tx_ref: transaction.tx_ref })
              .where(
                and(
                  eq(dispute_resolutions.dispute_id, target.id),
                  inArray(dispute_resolutions.status, ['pending', 'executing']),
                ),
              )
              .returning({ proposed_by: dispute_resolutions.proposed_by })
            // `resolved_by` is the author of the verdict, NOT whoever signed
            // it: the resolve tx is signed with the chain's shared dispute
            // authority key, and `disputes.execute` is a different permission
            // from `disputes.mediate`. The signer is on record separately, as
            // the tx_attempts row for this tx_ref. Reading proposed_by from
            // the very UPDATE that confirmed the proposal is what makes the
            // pair honest — the dispute can never name a resolver whose
            // proposal did not confirm, since both writes share this commit.
            // Null when nobody proposed (CLI/direct-resolve).
            await tx
              .update(disputes)
              .set({
                winner: disputeResolution.winner,
                resolved_at: new Date(),
                resolved_by: confirmed?.proposed_by ?? null,
              })
              .where(eq(disputes.id, target.id))
          }
        }
        return { applied: true, passed_applicant_ids, revived_applicant_ids }
      })
    },
    async resolveUserByWallet(chain_ns, address) {
      // The address comes from decoded on-chain event data, viem returns EVM
      // addresses EIP-55 checksummed. Match case-insensitively (EVM) so the
      // counterparty/actor resolves regardless of the stored row's case.
      const rows = await db
        .select({ user_id: user_wallets.user_id })
        .from(user_wallets)
        .where(and(eq(user_wallets.chain_ns, chain_ns), walletAddressEquals(chain_ns, address)))
        .limit(1)
      return rows[0]?.user_id ?? null
    },
  }
}
