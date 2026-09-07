/**
 * Everything a route must do to a DRAFT before it can build (or relay) its
 * create transaction — the one place, because two routes need it and the
 * checks are exactly the ones that must never differ between them:
 *
 *   ownership → still a draft → not taken down → no create already in flight
 *   → completion window (offramp drafts may lack one) → accept deadline
 *   DERIVED from the draft's window → chain configured → first-transaction
 *   gate → signer preference validated → assignee wallet re-resolved → the
 *   row RE-STAMPED with what the transaction will encode.
 *
 * Extracted from build-create (#18) when the relayed funding route needed the
 * identical preamble; the comments that justify each step travelled with it.
 */
import { and, eq } from 'drizzle-orm'
import { ErrorCode, type SignerPreferenceBody } from '@tenda/shared'
import { escrows, exchange_details } from '@tenda/shared/db/schema'
import { AppError } from '@server/lib/errors'
import { assertCallerWallet, assertNotTakenDown, readSignerPreference } from '@server/lib/escrow'
import type { EscrowRow } from '@server/lib/escrow-routes'
import { assertCanTransact, resolveAssigneeWalletAddress } from '@server/lib/auth/resolver'
import { normalizeContractAddress } from '@server/chains/contracts'
import type { ChainAdapter, ChainRegistry, CreateEscrowPayload } from '@server/chains/types'
import type { AppDatabase } from '@server/plugins/db'
import { hasPendingEscrowCreateTransaction } from './hasPendingEscrowCreateTransaction'
import { draftCreatePayload } from './draftCreatePayload'
import { acceptDeadlineMoved, deriveAcceptDeadline } from './deriveAcceptDeadline'

export interface PreparedDraftCreate {
  adapter: ChainAdapter
  payload: CreateEscrowPayload
  /** The caller's declared signing wallet, validated as theirs; absent → primary. */
  signer_address: string | undefined
}

export async function prepareDraftCreate(
  deps: { db: AppDatabase; chains: ChainRegistry },
  args: { escrow: EscrowRow; user_id: string; body: SignerPreferenceBody | null },
): Promise<PreparedDraftCreate> {
  const { escrow, user_id } = args
  if (escrow.creator_id !== user_id) {
    throw new AppError(403, ErrorCode.FORBIDDEN, 'Only the creator can publish a draft')
  }
  if (escrow.status !== 'draft') {
    throw new AppError(
      409,
      ErrorCode.ESCROW_WRONG_STATUS,
      'Only drafts can be published, this escrow already left the draft state',
    )
  }
  // Publishing IS an entry action — it funds the listing — and this path does
  // not go through `guardTransition`, so the takedown gate is applied by
  // hand. A hidden draft that published would lock the creator's money into
  // an escrow nobody is allowed to accept; deleting it still works.
  assertNotTakenDown(escrow, 'create')

  // A signed-and-broadcast create may still be verifying, building a second
  // create tx now would just fail on-chain (the PDA exists) and confuse the
  // client. Same guard as DELETE /v1/escrows/:id.
  if (await hasPendingEscrowCreateTransaction(deps.db, escrow.id)) {
    throw new AppError(
      409,
      ErrorCode.ESCROW_WRONG_STATUS,
      'A create transaction is awaiting confirmation, wait for it to settle',
    )
  }

  // Completion window: gigs always carry it (the create flow demands it);
  // server-opened exchange drafts may predate the stamped insert, fall back
  // to the offer's fiat payment window.
  let completion_duration_seconds = escrow.completion_duration_seconds
  if (completion_duration_seconds === null && escrow.kind === 'exchange') {
    const [details] = await deps.db
      .select({ payment_window_seconds: exchange_details.payment_window_seconds })
      .from(exchange_details)
      .where(eq(exchange_details.escrow_id, escrow.id))
      .limit(1)
    completion_duration_seconds = details?.payment_window_seconds ?? null
  }
  if (completion_duration_seconds === null) {
    throw new AppError(
      422,
      ErrorCode.VALIDATION_ERROR,
      'Draft has no completion window, delete it and create the listing again',
    )
  }

  // ONE rule, shared with the replay branch of POST /v1/escrows — reuse a
  // stored instant while a quote over it could still be live, redraw a lapsed
  // one. `deriveAcceptDeadline` carries the whole argument.
  const accept_deadline = deriveAcceptDeadline(escrow, new Date())

  // The chain may have been deconfigured since the draft was created (e.g.
  // BASE env removed), surface a clean 503, not a raw throw.
  if (!deps.chains.has(escrow.chain_id)) {
    throw new AppError(
      503,
      ErrorCode.SERVICE_UNAVAILABLE,
      `chain '${escrow.chain_id}' is not currently available`,
    )
  }
  const adapter = deps.chains.get(escrow.chain_id)
  // Publishing IS creating, same first-transaction gate as POST /v1/escrows
  // (covers server-opened fiat-offramp drafts that never hit create's gate).
  // Runs BEFORE the deadline write so a rejected publish mutates nothing.
  await assertCanTransact(deps.db, user_id, adapter.namespace)
  // Free-signer case (same as POST /v1/escrows): the declared signing wallet
  // must be one the caller has verified; absent → the primary.
  const signer_address = readSignerPreference(args.body)
  if (signer_address !== undefined) {
    await assertCallerWallet(deps.db, { user_id, chain_ns: adapter.namespace, address: signer_address })
  }
  // A direct-assigned draft bakes the assignee's wallet into the create tx —
  // and the row must RECORD what THIS build will bake (the same resolution
  // the builder runs), not what a previous build did. A draft republished
  // after the assignee changed wallets would otherwise keep the stale stamp,
  // and on EVM no event ever corrects it.
  let assigned_counterparty_address = escrow.assigned_counterparty_address
  if (escrow.assigned_counterparty_id !== null) {
    assigned_counterparty_address = await resolveAssigneeWalletAddress(
      deps.db,
      escrow.assigned_counterparty_id,
      adapter.namespace,
    )
  }

  // Persist what the unsigned tx will encode, so the DB row and the on-chain
  // account can never disagree after confirmation.
  //
  // The contract is RE-stamped, not preserved. A draft holds no funds, so
  // there is nothing to strand: it publishes into whichever contract is
  // current at the moment it is actually created. Preserving an older stamp
  // here would be the real bug — the draft would encode a create for a
  // contract it is no longer being built against, and the pending-create
  // guard above is what stops this racing a create already in flight.
  const escrow_contract = normalizeContractAddress(adapter.namespace, adapter.escrowAddress)
  // Only when something actually moved. `escrows.updated_at` auto-bumps on any
  // Drizzle update, and a build that changes nothing is not an edit to the
  // draft — the agent one-shot alone lands here twice (the 402 quote and the
  // X-PAYMENT resend), and neither is the user touching their listing.
  if (
    acceptDeadlineMoved(escrow.accept_deadline, accept_deadline) ||
    completion_duration_seconds !== escrow.completion_duration_seconds ||
    escrow_contract !== escrow.escrow_contract ||
    assigned_counterparty_address !== escrow.assigned_counterparty_address
  ) {
    await deps.db
      .update(escrows)
      .set({ accept_deadline, completion_duration_seconds, escrow_contract, assigned_counterparty_address })
      .where(and(eq(escrows.id, escrow.id), eq(escrows.status, 'draft')))
  }

  return {
    adapter,
    signer_address,
    // The same row → payload mapping POST /v1/escrows uses for a persisted
    // draft, under the deadline just derived above.
    payload: draftCreatePayload(escrow, { accept_deadline, completion_duration_seconds }),
  }
}
