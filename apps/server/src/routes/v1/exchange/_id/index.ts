/**
 * GET /v1/exchange/:id, exchange detail (cutover §3 rewrite): escrows ⨝
 * exchange_details + creator/counterparty refs, proofs, dispute and
 * reviews. Read-only; transitions live under /v1/escrows/:id/*.
 *
 * Drafts are private staging rows (fiat-rails opens them; my-offers lists
 * them), visible to their CREATOR only, 404 to everyone else.
 *
 * ANONYMOUS-TOLERANT since #179: the preHandler is `identifyViewer`, not
 * `authenticate`, so a stranger reads the listing half and a signed-in party
 * still gets theirs. Two consequences, both inherited from the gig detail that
 * has worked this way all along:
 *   - a private row (draft or taken-down) escalates to the FULL `authenticate`
 *     before deciding, so suspended accounts are rejected there like everywhere
 *     else — and an anonymous caller gets the 404 directly, because a 401 would
 *     confirm the id exists.
 *   - disclosure is decided by PARTY MEMBERSHIP only, never by role.
 *     `identifyViewer` does a bare `jwtVerify`, so a role claim on this path can
 *     be up to a token lifetime out of date; `escrow-detail-scope`'s header sets
 *     out why gating disclosure on that would hand a demoted admin every
 *     escrow's private half for a week. Admins read escrows through the dossier.
 */
import { FastifyPluginAsync } from 'fastify'
import { optionalUserId, uuidParamGuard } from '@server/lib/http/guards'
import { eq, inArray } from 'drizzle-orm'
import { escrows, exchange_details, users, reviews, bank_accounts } from '@tenda/shared/db/schema'
import { ErrorCode } from '@tenda/shared'
import type { ExchangeContract, ApiError, UserRef, ExchangePayoutAccount } from '@tenda/shared'
import { AppError } from '@server/lib/errors'
import {
  canViewHiddenEscrow,
  scopeEscrowAcceptanceMode,
  scopeEscrowPrivateFields,
  scopeMySignerAddress,
} from '@server/features/escrows/detail/scope'
import { loadEscrowEvidence } from '@server/features/escrows/detail/evidence'
import { isEscrowPartyOrAssignedRow, isEscrowPartyRow } from '@server/lib/escrow/party'
import { toExchangePartyRef } from '@server/features/fiat-rails/rates/exchange-read'
import { USER_COLS } from '@server/lib/db/users'

type GetRoute = ExchangeContract['get']

const iso = (d: Date | null): string | null => (d === null ? null : d.toISOString())

const exchangeById: FastifyPluginAsync = async (fastify) => {
  // Malformed `:id` reaches postgres as a uuid comparison and throws;
  // answer it the way an unknown id is already answered.
  fastify.addHook('preHandler', uuidParamGuard('Exchange offer not found'))

  fastify.get<{
    Params: GetRoute['params']
    Reply: GetRoute['response'] | ApiError
  }>('/', { preHandler: [fastify.identifyViewer] }, async (request, reply) => {
    const { id } = request.params

    const [row] = await fastify.db
      .select()
      .from(escrows)
      .innerJoin(exchange_details, eq(exchange_details.escrow_id, escrows.id))
      .where(eq(escrows.id, id))
      .limit(1)
    if (row === undefined) {
      throw new AppError(404, ErrorCode.NOT_FOUND, 'Exchange offer not found')
    }
    const escrow = row.escrows
    const details = row.exchange_details

    // Private rows — pre-publish drafts, and taken-down offers (CO1) which stay
    // visible to their parties because the escrow may be mid-flight on-chain.
    // An anonymous caller is refused HERE, with a 404 rather than a 401: the
    // 401 would confirm the id exists. A caller who sent a bearer goes through
    // the full `authenticate` first, so a suspended account is rejected on this
    // route exactly as on every other, and the role `canViewHiddenEscrow` reads
    // is the freshly re-read one rather than whatever the token claimed.
    // Structure and reasoning copied from the gig detail, not invented here.
    if (escrow.status === 'draft' || escrow.hidden) {
      if (request.headers.authorization === undefined) {
        throw new AppError(404, ErrorCode.NOT_FOUND, 'Exchange offer not found')
      }
      await fastify.authenticate(request, reply)
      if (reply.sent) return reply
      const allowed =
        escrow.status === 'draft'
          ? request.user.id === escrow.creator_id
          : canViewHiddenEscrow(escrow, { id: request.user.id, role: request.user.role })
      if (!allowed) {
        throw new AppError(404, ErrorCode.NOT_FOUND, 'Exchange offer not found')
      }
    }

    const userIds =
      escrow.counterparty_id === null
        ? [escrow.creator_id]
        : [escrow.creator_id, escrow.counterparty_id]

    // Party membership decides the private half — the same rule and the same
    // helper as the gig detail, so the two surfaces cannot drift. Admins are
    // NOT included (they read the dossier); see escrow-detail-scope. Derived
    // before the reads because it decides whether the evidence is read at all.
    // `null` for an anonymous reader, and every predicate below takes that:
    // `matchesAnyRow` refuses null explicitly, because two of the three party
    // columns are nullable and an unclaimed escrow would otherwise report every
    // stranger as a party. Read AFTER the private-row branch above, which is
    // the path that decorates the request when a draft or hidden row is hit.
    const viewerId = optionalUserId(request)
    const isParty = isEscrowPartyOrAssignedRow(escrow, viewerId)
    // The NARROWER of the two party questions: the creator and an ACCEPTED
    // counterparty, with a pending direct-offer assignee excluded. Two things
    // sit behind this one line — the seller's bank details, and since #175
    // their legal name and face — and they must never drift apart, so the
    // question is asked once and named rather than repeated at each use.
    const isSettledParty = isEscrowPartyRow(escrow, viewerId)

    const [userRows, evidence, offerReviews] = await Promise.all([
      fastify.db.select(USER_COLS).from(users).where(inArray(users.id, userIds)),
      loadEscrowEvidence(fastify.db, id, isParty),
      fastify.db.select().from(reviews).where(eq(reviews.escrow_id, id)),
    ])

    const userMap = new Map<string, UserRef>(userRows.map((u) => [u.id, u]))
    const creator = userMap.get(escrow.creator_id)
    if (creator === undefined) {
      throw new AppError(500, ErrorCode.INTERNAL_ERROR, 'escrow creator row missing')
    }
    // The counterparty keeps its FULL `UserRef`: `scopeEscrowPrivateFields`
    // below already withholds it from everyone but the parties, so narrowing it
    // would take identity from the people entitled to it rather than from a
    // stranger. #175's surface is the CREATOR, whom everyone can see.
    const counterparty =
      escrow.counterparty_id === null ? null : (userMap.get(escrow.counterparty_id) ?? null)

    // Payout account is PII: reveal the full details only to the offer's
    // settled parties, so a matched buyer knows where to pay. Absent to
    // everyone else, and before an account is linked.
    let payout_account: ExchangePayoutAccount | null = null
    if (isSettledParty && details.payout_account_id !== null) {
      const [acct] = await fastify.db
        .select({
          kind: bank_accounts.kind,
          bank_code: bank_accounts.bank_code,
          account_number: bank_accounts.account_number,
          account_name: bank_accounts.account_name,
          country: bank_accounts.country,
        })
        .from(bank_accounts)
        .where(eq(bank_accounts.id, details.payout_account_id))
        .limit(1)
      payout_account = acct ?? null
    }

    return reply.send({
      escrow_id: escrow.id,
      chain_id: escrow.chain_id,
      asset: escrow.asset,
      amount_raw: escrow.amount_raw,
      status: escrow.status,
      // Only parties and admins get past the hidden branch above, so this is
      // never disclosed to anyone it is being hidden from. Same as the gig.
      hidden: escrow.hidden,
      fiat_amount: details.fiat_amount,
      fiat_currency: details.fiat_currency,
      rate: details.rate,
      payment_window_seconds: details.payment_window_seconds,
      accept_deadline: iso(escrow.accept_deadline),
      created_at: escrow.created_at.toISOString(),
      // The creator's LEGAL NAME and FACE sit behind the same line as the
      // payout account above, and are handed the same answer (#175) — not the
      // broader `isParty` used for the private half, because a pending assignee
      // has not accepted and the other side's identity is not theirs yet.
      creator: toExchangePartyRef(creator, isSettledParty),
      is_seeker: escrow.is_seeker,
      // The buyer's fiat receipt — evidence, not terms. Scoped with `proofs`
      // below rather than shipped beside the price.
      payment_proof_url: isParty ? details.payment_proof_url : null,
      // Viewer-relative bound wallet (chain-attested); null for outsiders.
      my_signer_address: scopeMySignerAddress(escrow, viewerId),
      // A P2P offer normally has no acceptance mode at all, but "normally" is
      // not "always": `assigned_counterparty_id` carries no kind restriction at
      // create, so a direct-invite offer is reachable and only the assignee may
      // accept it. Reporting the real mode rather than assuming the unrestricted
      // one is what stops the CTA offering a stranger an Accept the server 403s.
      // `requires_approval` is gig-only TODAY and rides along as the column
      // value, so relaxing that stays a server-side change.
      ...scopeEscrowAcceptanceMode(escrow, isParty),
      dispute_bond_raw: escrow.dispute_bond_raw,
      completion_deadline: iso(escrow.completion_deadline),
      submitted_at: iso(escrow.submitted_at),
      approval_deadline: iso(escrow.approval_deadline),
      // Who is trading with whom, the payment evidence and the dispute reason
      // are the parties' business — an offer being readable is not a licence
      // to read the trade. Same rule and same helper as the gig detail.
      ...scopeEscrowPrivateFields({ counterparty, ...evidence }, isParty),
      // Reviews stay public for the same reason they do on a gig: they are the
      // rows `/v1/users/:id/reviews` already serves on a profile.
      reviews: offerReviews.map((review) => ({
        ...review,
        created_at: review.created_at.toISOString(),
      })),
      payout_account,
    })
  })
}

export default exchangeById
