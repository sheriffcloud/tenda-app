/**
 * Applications store — the drizzle seam. Mirrors features/capacity/store.ts:
 * every query the feature needs, and nothing else, so the pure rules in
 * `service.ts` stay database-free.
 */

import { and, count, desc, eq, inArray, lt } from 'drizzle-orm'
import { gig_applications, escrows, gig_details, users } from '@tenda/shared/db/schema'
import { ACTIVE_APPLICATION_STATUSES, type ApplicationStatus } from '@tenda/shared'
import type { EscrowStatus } from '@server/lib/escrow'
import { isUuidLike } from '@server/lib/uuid'
import type { AppDatabase } from '@server/plugins/db'

export interface ApplicationRow {
  id: string
  escrow_id: string
  applicant_id: string
  message: string | null
  /** The wallet the applicant chose to work under; null predates the choice. */
  wallet_address: string | null
  status: ApplicationStatus
  expires_at: Date
  created_at: Date
}

/** An applicant as the poster's shortlist shows them. */
export interface ApplicantRow extends ApplicationRow {
  first_name: string
  last_name: string
  avatar_url: string | null
  review_score: string | null
}

export interface ApplicationStore {
  /** Open applications this worker holds, across all gigs. */
  countOpen(applicant_id: string): Promise<number>
  /** Open applications on ONE gig — the poster's "waiting on you" number. */
  countOpenForEscrow(escrow_id: string): Promise<number>
  /** The applicant's row on one gig, whatever its status (the unique pair). */
  find(escrow_id: string, applicant_id: string): Promise<ApplicationRow | null>
  /**
   * Create the application, or re-open the applicant's existing row for this
   * gig. Re-applying must not stack rows — the unique (escrow_id, applicant_id)
   * pair makes that an upsert rather than an insert.
   */
  upsert(input: {
    escrow_id: string
    applicant_id: string
    message: string | null
    /** Validated by the route; recorded so the assign bakes exactly it. */
    wallet_address: string
    expires_at: Date
  }): Promise<ApplicationRow>
  /** Poster's shortlist for one gig, newest first. */
  listForEscrow(escrow_id: string, statuses: readonly ApplicationStatus[]): Promise<ApplicantRow[]>
  /** Move one row to a settled status; returns false if it was not `open`. */
  settle(id: string, status: Exclude<ApplicationStatus, 'open'>): Promise<boolean>
  /** Extend `expires_at` while an assignment transaction is in flight. */
  hold(id: string, expires_at: Date): Promise<void>
  /** Sweep: expire open rows past their deadline. Returns the count. */
  expireDue(now: Date, limit: number): Promise<number>
}

const APPLICATION_COLS = {
  id: gig_applications.id,
  escrow_id: gig_applications.escrow_id,
  applicant_id: gig_applications.applicant_id,
  message: gig_applications.message,
  wallet_address: gig_applications.wallet_address,
  status: gig_applications.status,
  expires_at: gig_applications.expires_at,
  created_at: gig_applications.created_at,
} as const

export function drizzleApplicationStore(db: AppDatabase): ApplicationStore {
  return {
    async countOpen(applicant_id) {
      const [row] = await db
        .select({ n: count() })
        .from(gig_applications)
        .where(
          and(
            eq(gig_applications.applicant_id, applicant_id),
            inArray(gig_applications.status, [...ACTIVE_APPLICATION_STATUSES]),
          ),
        )
      return row?.n ?? 0
    },

    async countOpenForEscrow(escrow_id) {
      const [row] = await db
        .select({ n: count() })
        .from(gig_applications)
        .where(
          and(
            eq(gig_applications.escrow_id, escrow_id),
            inArray(gig_applications.status, [...ACTIVE_APPLICATION_STATUSES]),
          ),
        )
      return row?.n ?? 0
    },

    async find(escrow_id, applicant_id) {
      const [row] = await db
        .select(APPLICATION_COLS)
        .from(gig_applications)
        .where(
          and(
            eq(gig_applications.escrow_id, escrow_id),
            eq(gig_applications.applicant_id, applicant_id),
          ),
        )
        .limit(1)
      return row ?? null
    },

    async upsert({ escrow_id, applicant_id, message, wallet_address, expires_at }) {
      const [row] = await db
        .insert(gig_applications)
        .values({ escrow_id, applicant_id, message, wallet_address, expires_at, status: 'open' })
        .onConflictDoUpdate({
          target: [gig_applications.escrow_id, gig_applications.applicant_id],
          // Re-applying revives the row: a withdrawn or expired applicant who
          // changes their mind gets a fresh window, not their old one — and
          // their latest wallet choice, not their old one.
          set: { message, wallet_address, expires_at, status: 'open', updated_at: new Date() },
        })
        .returning(APPLICATION_COLS)
      // The insert always returns exactly one row (conflict → update).
      if (row === undefined) throw new Error('application upsert returned no row')
      return row
    },

    async listForEscrow(escrow_id, statuses) {
      return db
        .select({
          ...APPLICATION_COLS,
          first_name: users.first_name,
          last_name: users.last_name,
          avatar_url: users.avatar_url,
          review_score: users.review_score,
        })
        .from(gig_applications)
        .innerJoin(users, eq(users.id, gig_applications.applicant_id))
        .where(
          and(
            eq(gig_applications.escrow_id, escrow_id),
            inArray(gig_applications.status, [...statuses]),
          ),
        )
        .orderBy(desc(gig_applications.created_at))
    },

    async settle(id, status) {
      // Guarded on `open` so a settled row can never be re-settled — that is
      // what makes withdraw/expire/assign idempotent under replay.
      const updated = await db
        .update(gig_applications)
        .set({ status })
        .where(and(eq(gig_applications.id, id), eq(gig_applications.status, 'open')))
        .returning({ id: gig_applications.id })
      return updated.length > 0
    },

    async hold(id, expires_at) {
      await db
        .update(gig_applications)
        .set({ expires_at })
        .where(and(eq(gig_applications.id, id), eq(gig_applications.status, 'open')))
    },

    async expireDue(now, limit) {
      // Bounded like the escrow expiry sweep: a backlog is drained across
      // ticks rather than in one unbounded statement.
      const due = await db
        .select({ id: gig_applications.id })
        .from(gig_applications)
        .where(and(eq(gig_applications.status, 'open'), lt(gig_applications.expires_at, now)))
        .limit(limit)
      if (due.length === 0) return 0
      const updated = await db
        .update(gig_applications)
        .set({ status: 'expired' })
        .where(
          and(
            inArray(
              gig_applications.id,
              due.map((r) => r.id),
            ),
            eq(gig_applications.status, 'open'),
          ),
        )
        .returning({ id: gig_applications.id })
      return updated.length
    },
  }
}

/** Escrow facts the application routes gate on, read in one query. */
export interface ApplicationEscrowRow {
  id: string
  kind: 'gig' | 'exchange'
  status: EscrowStatus
  creator_id: string
  /** Names the chain namespace the applicant must hold a wallet on. */
  chain_id: string
  requires_approval: boolean
  accept_deadline: Date | null
  /** CO1 takedown — a hidden gig takes no new applications (`assertNotTakenDown`). */
  hidden: boolean
  /**
   * gig_details.title — null only for an exchange escrow, which every caller
   * 404s on anyway. Read here so the "new applicant" notice can name the gig
   * without a second round-trip; a poster may have several taking applications.
   */
  title: string | null
}

export async function findApplicationEscrow(
  db: AppDatabase,
  escrow_id: string,
): Promise<ApplicationEscrowRow | null> {
  // Postgres rejects a malformed uuid at the driver, which surfaces as a 500.
  // Same guard `loadEscrowOr404` applies for the same reason: a client typo is
  // a 404, not a server error.
  if (!isUuidLike(escrow_id)) return null
  const [row] = await db
    .select({
      id: escrows.id,
      kind: escrows.kind,
      status: escrows.status,
      creator_id: escrows.creator_id,
      chain_id: escrows.chain_id,
      requires_approval: escrows.requires_approval,
      accept_deadline: escrows.accept_deadline,
      hidden: escrows.hidden,
      title: gig_details.title,
    })
    .from(escrows)
    // LEFT, not inner: an exchange escrow has no gig_details row and must
    // still come back so the callers can answer it with their own 404 rather
    // than an indistinguishable "no such escrow".
    .leftJoin(gig_details, eq(gig_details.escrow_id, escrows.id))
    .where(eq(escrows.id, escrow_id))
    .limit(1)
  return row ?? null
}
