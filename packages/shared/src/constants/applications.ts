/**
 * Gig-application vocabulary — the "raise your hand" surface that approval-mode
 * gigs are assigned from.
 *
 * Single source for the DB enum, the server's state moves and the mobile
 * screens, so the statuses cannot drift between them (same reasoning as
 * `PROOF_TYPES` and `ESCROW_TX_TYPES`).
 */

/**
 * Lifecycle of one application. Terminal states are everything but `open`.
 *
 *  - `open`      — live; the poster can assign this applicant.
 *  - `withdrawn` — the applicant pulled out themselves.
 *  - `expired`   — `expires_at` passed without an assignment (swept by
 *                  `expire-applications`).
 *  - `assigned`  — the poster picked this applicant; the escrow moved on-chain.
 *  - `passed`    — someone else was assigned, so this one lost. Set in the same
 *                  transaction as the winner, never by a poster action.
 *  - `released`  — this applicant WAS assigned, and the assignment was later
 *                  undone on-chain (`unassign`). A sixth value rather than
 *                  reusing one of the above, because none of them is true of
 *                  it: `withdrawn` would tell the poster "they withdrew" when
 *                  the poster is who let them go, and `passed` would tell the
 *                  worker "the poster picked someone else" when nobody was
 *                  picked. The status is read straight out as user-facing
 *                  copy on both sides (see mobile gig-applications/copy.ts),
 *                  so an inaccurate one is not a tidiness problem.
 */
export const APPLICATION_STATUSES = [
  'open',
  'withdrawn',
  'expired',
  'assigned',
  'passed',
  'released',
] as const

export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number]

export function isApplicationStatus(value: unknown): value is ApplicationStatus {
  return typeof value === 'string' && (APPLICATION_STATUSES as readonly string[]).includes(value)
}

/**
 * The only status a poster may assign from, and the only one a worker may
 * withdraw. Module-private: every consumer compares against the `'open'`
 * literal, which the `ApplicationStatus` union already type-checks, so
 * exporting it would be a second name for the same thing.
 */
const APPLICATION_STATUS_OPEN: ApplicationStatus = 'open'

/**
 * Statuses that still occupy one of the applicant's `max_open_applications`
 * slots. Only `open` does: every other state is settled, and holding a slot
 * for a settled application would punish someone for having applied.
 */
export const ACTIVE_APPLICATION_STATUSES: readonly ApplicationStatus[] = [APPLICATION_STATUS_OPEN]

/**
 * How long the assign route extends a chosen application's `expires_at`.
 *
 * The route builds an unsigned transaction; the applier settles the
 * application only once that transaction CONFIRMS (a failed signature must not
 * burn someone's application). Between those two moments the row could expire
 * and the applier would find nothing — which silently costs the poster the
 * strike-eligibility stamp. Extending the deadline makes the applier's lookup
 * deterministic for the length of a normal signing session.
 *
 * A constant rather than a `platform_config` column on purpose: it is a
 * mechanism-internal grace window sized by how long a wallet round-trip takes,
 * not a policy an operator would tune independently of the TTL.
 */
export const APPLICATION_ASSIGN_HOLD_SECONDS = 15 * 60

/** Max characters on the optional pitch a worker attaches to an application. */
export const APPLICATION_MESSAGE_MAX_LENGTH = 500

/**
 * Ceilings for the tunables in `platform_config`. Mirrors the
 * `MAX_PENDING_GIGS_CEILING` pattern: the column's CHECK and the admin route
 * validate against the same number, so an operator cannot store a value the
 * app would then have to defend against.
 */
export const MAX_OPEN_APPLICATIONS_CEILING = 100

/** 1 hour — below this an application expires before a poster realistically sees it. */
export const MIN_APPLICATION_TTL_SECONDS = 60 * 60

/** 30 days — beyond this "unexpired" stops meaning the applicant is still interested. */
export const MAX_APPLICATION_TTL_SECONDS = 30 * 24 * 60 * 60

/**
 * Below this much time left on `accept_deadline`, unassigning is warned about
 * rather than offered silently.
 *
 * The deadline does not extend across assign/unassign cycles, so a poster
 * cycling workers can run it out and lose the gig to the refund path. 24h is
 * the point past which finding, vetting and assigning a replacement stops
 * being realistic — the same order as the shortest `ACCEPT_DEADLINE_OPTIONS`
 * entry a poster can choose in the first place.
 */
export const APPLICATION_UNASSIGN_TIGHT_WINDOW_SECONDS = 24 * 60 * 60
