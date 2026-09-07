/**
 * Gig applications — the "raise your hand" surface for approval-mode gigs.
 *
 *   GET    poster: the shortlist for their own gig
 *   POST   worker: apply (re-applying upserts the same row)
 *   DELETE worker: withdraw their own
 *
 * None of these touch the chain. Assignment does, and it lives on the escrow
 * transition surface (`POST /v1/escrows/:id/assign`) with the other
 * transaction-building routes.
 */

import type { FastifyPluginAsync } from 'fastify'
import {
  ACTIVE_APPLICATION_STATUSES,
  APPLICATION_MESSAGE_MAX_LENGTH,
  ErrorCode,
  isApplicationStatus,
  type ApplicationStatus,
  type ApplyToGigBody,
} from '@tenda/shared'
import { AppError } from '@server/lib/errors'
import { assertNotTakenDown } from '@server/lib/escrow'
import { requireProfileComplete } from '@server/lib/guards'
import { requireGoodStanding } from '@server/features/reputation/guards'
import { getPlatformConfig } from '@server/lib/platform'
import {
  applicationExpiry,
  isApplicationMessageTooLong,
  normaliseApplicationMessage,
} from '@server/features/applications/service'
import { assertApplicationCapacity } from '@server/features/applications/guards'
import {
  drizzleApplicationStore,
  findApplicationEscrow,
  type ApplicationEscrowRow,
} from '@server/features/applications/store'
import { toApplicantWire, toApplicationWire } from '@server/features/applications/wire'
import { isUuidLike } from '@server/lib/uuid'
import { appEvents } from '@server/lib/events'
import type { AppDatabase } from '@server/plugins/db'

/**
 * The gig must exist, be a gig, be visible, and be taking applications.
 *
 * Applying to an instant-mode gig is refused rather than silently accepted:
 * the poster there has no way to assign from applications, so an accepted
 * application would be a promise nothing can keep.
 *
 * A TAKEN-DOWN gig is refused for the neighbouring reason: the poster cannot
 * assign from it either (`assign_accept` is blocked), so the application would
 * be dead on arrival. Withdrawing an application already on it stays open —
 * that route reads the application, not the gig, and `/v1/applications` keeps
 * listing hidden gigs precisely so the exit never dead-ends.
 */
async function loadOpenForApplications(
  db: AppDatabase,
  escrow_id: string,
): Promise<ApplicationEscrowRow & { title: string }> {
  const escrow = await findApplicationEscrow(db, escrow_id)
  // `title` comes from a LEFT join, so it is nullable on the row type. A gig
  // with no listing satellite is not something a worker can be shown, let
  // alone apply to, so it reads as "no such gig" — and narrowing it here means
  // the notice below can NAME the gig without a fallback string that would
  // otherwise render as `applied to ""`.
  if (escrow === null || escrow.kind !== 'gig' || escrow.title === null) {
    throw new AppError(404, ErrorCode.GIG_NOT_FOUND, 'Gig not found')
  }
  assertNotTakenDown(escrow, 'apply')
  if (!escrow.requires_approval) {
    throw new AppError(
      409,
      ErrorCode.APPLICATIONS_NOT_OPEN,
      'This gig is first-come, first-served — accept it directly instead of applying.',
    )
  }
  return { ...escrow, title: escrow.title }
}

const route: FastifyPluginAsync = async (fastify) => {
  // GET — the poster's shortlist.
  fastify.get<{ Params: { id: string }; Querystring: { status?: string } }>(
    '/',
    { preHandler: [fastify.authenticate] },
    async (request) => {
      const escrow = await findApplicationEscrow(fastify.db, request.params.id)
      if (escrow === null || escrow.kind !== 'gig') {
        throw new AppError(404, ErrorCode.GIG_NOT_FOUND, 'Gig not found')
      }
      // Applicants are only the poster's business: the shortlist reveals who
      // else is competing, which no rival applicant may see.
      if (escrow.creator_id !== request.user.id) {
        throw new AppError(403, ErrorCode.FORBIDDEN, 'Only the poster can see applicants')
      }
      const statuses = parseStatusFilter(request.query.status)
      const rows = await drizzleApplicationStore(fastify.db).listForEscrow(escrow.id, statuses)
      return { data: rows.map(toApplicantWire) }
    },
  )

  // POST — apply.
  fastify.post<{ Params: { id: string }; Body: ApplyToGigBody | undefined }>(
    '/',
    {
      preHandler: [fastify.authenticate, requireProfileComplete, requireGoodStanding('accept')],
    },
    async (request, reply) => {
      const escrow = await loadOpenForApplications(fastify.db, request.params.id)
      if (escrow.creator_id === request.user.id) {
        throw new AppError(
          403,
          ErrorCode.CANNOT_ACCEPT_OWN_GIG,
          'You cannot apply to your own gig',
        )
      }
      if (escrow.status !== 'open') {
        throw new AppError(
          409,
          ErrorCode.ESCROW_WRONG_STATUS,
          'This gig is no longer taking applications',
        )
      }
      const now = new Date()
      // An expired gig cannot be assigned from, so an application on it would
      // be dead on arrival — refuse it while we can still say why.
      if (escrow.accept_deadline !== null && escrow.accept_deadline <= now) {
        throw new AppError(
          409,
          ErrorCode.ACCEPT_DEADLINE_PASSED,
          'This gig has closed to new workers',
        )
      }

      const message = normaliseApplicationMessage(request.body?.message)
      if (isApplicationMessageTooLong(message)) {
        throw new AppError(
          422,
          ErrorCode.VALIDATION_ERROR,
          `message must be ${APPLICATION_MESSAGE_MAX_LENGTH} characters or fewer`,
        )
      }

      // Read once and pass it down: the capacity guard needs it, and so does
      // the notice below, which must fire for a hand newly raised but not for
      // someone editing the pitch on an application the poster already has.
      const store = drizzleApplicationStore(fastify.db)
      const existing = await store.find(escrow.id, request.user.id)
      await assertApplicationCapacity(fastify.db, request.user.id, existing)

      const cfg = await getPlatformConfig(fastify.db)
      const row = await store.upsert({
        escrow_id: escrow.id,
        applicant_id: request.user.id,
        message,
        expires_at: applicationExpiry(now, cfg.application_ttl_seconds),
      })

      // Fires for a hand NEWLY raised, never for someone editing the pitch on
      // an application the poster already has — a second buzz would train them
      // to ignore the notice that matters.
      if (existing === null || existing.status !== 'open') {
        appEvents.emit('gig.application_received', {
          escrow_id: escrow.id,
          creator_id: escrow.creator_id,
          applicant_id: request.user.id,
          title: escrow.title,
        })
      }
      return reply.code(201).send(toApplicationWire(row))
    },
  )

  // DELETE — withdraw the caller's own application.
  fastify.delete<{ Params: { id: string } }>(
    '/',
    { preHandler: [fastify.authenticate] },
    async (request) => {
      // This handler never loads the escrow, so it needs the id guard of its
      // own — without it a malformed id reaches the driver as a 500.
      if (!isUuidLike(request.params.id)) {
        throw new AppError(404, ErrorCode.NOT_FOUND, 'You have not applied to this gig')
      }
      const store = drizzleApplicationStore(fastify.db)
      const existing = await store.find(request.params.id, request.user.id)
      if (existing === null) {
        throw new AppError(404, ErrorCode.NOT_FOUND, 'You have not applied to this gig')
      }
      // `settle` is guarded on `open`, so withdrawing an already-settled row
      // is a clean 409 rather than a silent no-op that reads as success.
      const withdrawn = await store.settle(existing.id, 'withdrawn')
      if (!withdrawn) {
        throw new AppError(
          409,
          ErrorCode.APPLICATION_NOT_OPEN,
          `This application is already ${existing.status}`,
        )
      }
      return { withdrawn: true as const }
    },
  )
}

/**
 * `?status=open,passed` — defaults to the live set the poster acts on.
 *
 * Narrows through the shared `isApplicationStatus` guard rather than a
 * membership check plus a cast: the guard already exists for exactly this, and
 * using it means the return type is proved rather than asserted.
 */
function parseStatusFilter(raw: string | undefined): readonly ApplicationStatus[] {
  if (raw === undefined || raw === '') return ACTIVE_APPLICATION_STATUSES
  const wanted: ApplicationStatus[] = []
  const invalid: string[] = []
  for (const part of raw.split(',')) {
    const value = part.trim()
    if (isApplicationStatus(value)) wanted.push(value)
    else invalid.push(value)
  }
  if (invalid.length > 0) {
    throw new AppError(
      400,
      ErrorCode.VALIDATION_ERROR,
      `unknown application status: ${invalid.join(', ')}`,
    )
  }
  return wanted
}

export default route
