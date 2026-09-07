/**
 * GET /v1/gigs/:id, public gig detail (cutover §3 rewrite): escrows ⨝
 * gig_details + creator/counterparty refs, proofs, dispute and reviews.
 * Read-only; transitions live under /v1/escrows/:id/*.
 *
 * Drafts are pre-publish staging rows: 404 to the public, but the CREATOR
 * must see them (my-gigs lists drafts; the Delete Draft CTA lives here),
 * so a draft hit runs the full authenticate (suspended accounts rejected
 * like everywhere else) and compares the caller.
 *
 * The route is OPTIONALLY authenticated. It stays public — an anonymous read
 * returns the same LISTING it always did — but a bearer buys two things: the
 * `viewer` block (the caller's own application and, for the poster, how many
 * are waiting — a question that cannot be answered client-side, see
 * GigViewerContext), and, for a PARTY, the private half of the escrow: who is
 * working on it, the proof files, the dispute reason. See
 * `escrow-detail-scope.ts` for why those are not part of "the listing", and
 * why party membership rather than role decides it on this route.
 */
import { FastifyPluginAsync } from 'fastify'
import { eq, inArray } from 'drizzle-orm'
import { escrows, gig_details, users, reviews } from '@tenda/shared/db/schema'
import { ErrorCode } from '@tenda/shared'
import type { GigsContract, ApiError, UserRef } from '@tenda/shared'
import { AppError } from '@server/lib/errors'
import {
  canViewHiddenEscrow,
  scopeEscrowAcceptanceMode,
  scopeEscrowPrivateFields,
} from '@server/lib/escrow-detail-scope'
import { loadEscrowEvidence } from '@server/lib/escrow-detail-evidence'
import { isEscrowPartyOrAssignedRow } from '@server/lib/escrow-party'
import { optionalUserId, uuidParamGuard } from '@server/lib/guards'
import { loadGigViewerContext } from '@server/features/applications/viewer'
import { USER_COLS } from '@server/lib/users'

type GetRoute = GigsContract['get']

const iso = (d: Date | null): string | null => (d === null ? null : d.toISOString())

const gigById: FastifyPluginAsync = async (fastify) => {
  // Malformed `:id` reaches postgres as a uuid comparison and throws;
  // answer it the way an unknown id is already answered.
  fastify.addHook('preHandler', uuidParamGuard('Gig not found'))

  fastify.get<{
    Params: GetRoute['params']
    Reply: GetRoute['response'] | ApiError
  }>('/', { preHandler: [fastify.identifyViewer] }, async (request, reply) => {
    const { id } = request.params

    const [row] = await fastify.db
      .select()
      .from(escrows)
      .innerJoin(gig_details, eq(gig_details.escrow_id, escrows.id))
      .where(eq(escrows.id, id))
      .limit(1)
    if (row === undefined) {
      throw new AppError(404, ErrorCode.NOT_FOUND, 'Gig not found')
    }
    const escrow = row.escrows
    const details = row.gig_details

    // Private rows (pre-publish drafts; CO1 taken-down listings) must read
    // as 404 to anyone unauthorized, anonymous callers get the 404
    // directly (authenticate would 401 and leak that the id exists).
    // Authenticated callers go through the full authenticate (suspended
    // accounts rejected like everywhere else), then the ownership check:
    // drafts are creator-only; hidden listings stay visible to all parties
    // (the escrow may be mid-flight on-chain) and to admins.
    if (escrow.status === 'draft' || escrow.hidden) {
      if (request.headers.authorization === undefined) {
        throw new AppError(404, ErrorCode.NOT_FOUND, 'Gig not found')
      }
      await fastify.authenticate(request, reply)
      if (reply.sent) return reply
      const allowed =
        escrow.status === 'draft'
          ? request.user.id === escrow.creator_id
          : canViewHiddenEscrow(escrow, { id: request.user.id, role: request.user.role })
      if (!allowed) {
        throw new AppError(404, ErrorCode.NOT_FOUND, 'Gig not found')
      }
    }

    const userIds =
      escrow.counterparty_id === null
        ? [escrow.creator_id]
        : [escrow.creator_id, escrow.counterparty_id]

    // Read AFTER the private-row branch above: a draft hit runs the full
    // `authenticate`, which is what decorates the request in that path.
    //
    // Party membership only — no role. This route is reached through
    // `identifyViewer`, which does a bare `jwtVerify` and therefore carries a
    // role claim up to a token lifetime (7d) out of date; `authenticate`
    // refreshes it, this path cannot. Admins read escrows through the admin
    // dossier, so nothing is lost by not consulting it here.
    const viewer_id = optionalUserId(request)
    const isParty = isEscrowPartyOrAssignedRow(escrow, viewer_id)

    const [userRows, evidence, gigReviews, viewer] = await Promise.all([
      fastify.db.select(USER_COLS).from(users).where(inArray(users.id, userIds)),
      // Skips both reads entirely for an outsider; still projected below.
      loadEscrowEvidence(fastify.db, id, isParty),
      fastify.db.select().from(reviews).where(eq(reviews.escrow_id, id)),
      loadGigViewerContext(fastify.db, {
        escrow_id: id,
        creator_id: escrow.creator_id,
        viewer_id,
        requires_approval: escrow.requires_approval,
      }),
    ])

    const userMap = new Map<string, UserRef>(userRows.map((u) => [u.id, u]))
    const creator = userMap.get(escrow.creator_id)
    if (creator === undefined) {
      throw new AppError(500, ErrorCode.INTERNAL_ERROR, 'escrow creator row missing')
    }
    const counterparty =
      escrow.counterparty_id === null ? null : (userMap.get(escrow.counterparty_id) ?? null)

    return reply.send({
      escrow_id: escrow.id,
      public_feed_revision: escrow.public_feed_revision,
      chain_id: escrow.chain_id,
      asset: escrow.asset,
      amount_raw: escrow.amount_raw,
      is_seeker: escrow.is_seeker,
      status: escrow.status,
      // Unscoped on purpose: the branch above means only PARTIES and admins
      // ever reach this line with `hidden` true, and they are exactly who has
      // to be told — the escrow stays operable for them, so a silent takedown
      // would leave the poster wondering why nobody applies.
      hidden: escrow.hidden,
      accept_deadline: iso(escrow.accept_deadline),
      created_at: escrow.created_at.toISOString(),
      title: details.title,
      description: details.description,
      category: details.category as GetRoute['response']['category'],
      country: details.country,
      city: details.city,
      latitude: details.latitude,
      longitude: details.longitude,
      remote: details.remote,
      cross_border: details.cross_border,
      proof_requirements: details.proof_requirements,
      creator,
      completion_duration_seconds: escrow.completion_duration_seconds,
      completion_deadline: iso(escrow.completion_deadline),
      submitted_at: iso(escrow.submitted_at),
      approval_deadline: iso(escrow.approval_deadline),
      dispute_bond_raw: escrow.dispute_bond_raw,
      // Flag public, assignee id party-only — the same projection the exchange
      // detail uses, so the two surfaces cannot mean different things by
      // "assigned". Rationale lives with the helper.
      ...scopeEscrowAcceptanceMode(escrow, isParty),
      unassign_window_seconds: escrow.unassign_window_seconds,
      assignment_released_at: iso(escrow.assignment_released_at),
      ...scopeEscrowPrivateFields({ counterparty, ...evidence }, isParty),
      // Reviews stay public: they are the same rows `/v1/users/:id/reviews`
      // serves on a profile, and public reputation is the point of them.
      reviews: gigReviews,
      viewer,
    })
  })
}

export default gigById
