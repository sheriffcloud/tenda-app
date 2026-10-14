/**
 * Copy for the approval-mode surface.
 *
 * `APPLY_OBLIGATION` is load-bearing, not decoration. D2 makes an applicant
 * accountable for a gig they are assigned to — a worker who raised their hand
 * and then vanished earns an abandonment strike — so the obligation has to be
 * legible at the moment they opt in, not discovered afterwards. D5 settles the
 * rest by copy rather than mechanism: Tenda does not verify that an applicant
 * is still free when the poster picks them, so the applicant is told plainly
 * that they may be chosen at any time until their application expires, and
 * that withdrawing is how they say otherwise.
 *
 * Moved from apps/mobile/components/gig/gig-applications/copy.ts 2026-08-15:
 * wording that states an obligation must be reviewable in ONE place, for
 * both clients.
 */

import { acceptWindowState } from '../utils/gig-utils'
import type { ApplicationStatus } from './applications'
import type { EscrowStatus } from '../types/escrow'
import { formatDuration } from '../utils/gig-display'

/**
 * The shape both clients' expandable notices render — structural, so
 * mobile's ExpandableNotice and web's notice component consume it without a
 * UI import in shared.
 */
export interface NoticeContent {
  summary: string
  title: string
  description: string
  tone: 'info' | 'warning' | 'danger'
}

/**
 * Just enough of a gig to say whether it can still take a worker. Both the
 * detail (`GigDetail`) and the applicant's own list (`GigSummary`) satisfy it.
 */
interface OpenApplicationGig {
  status: EscrowStatus
  accept_deadline: string | null
}

/** Shown above the pitch field, before the applicant commits. */
export const APPLY_OBLIGATION =
  'The poster can pick you at any time until your application expires. Withdraw it if you stop being available — being assigned and then going quiet counts against your standing.'

export const APPLY_TITLE = 'Apply for this gig'
export const APPLY_MESSAGE_LABEL = 'Message to the poster (optional)'
export const APPLY_MESSAGE_PLACEHOLDER =
  'Why you are a good fit, when you can start, anything they should know.'
export const APPLY_SUBMIT_LABEL = 'Send application'

/** Above the wallet picker: the assign BAKES this choice on-chain. */
export const APPLY_WALLET_LABEL = 'Wallet to work under'
export const APPLY_WALLET_HINT =
  'If assigned, payment is locked to this wallet — pick one you control and can sign with.'
/** Zero linked wallets on the gig's chain: applying is impossible until one is linked. */
export const APPLY_WALLET_REQUIRED = (chainLabel: string) =>
  `This gig pays on ${chainLabel}. Link a wallet on that chain to apply.`
export const APPLY_WALLET_LINK_CTA = 'Link a wallet'
/** The trust list is still loading — an empty picker must never read as "none linked". */
export const APPLY_WALLET_LOADING = 'Loading your wallets…'
/** The trust list FAILED to load — a wordless disabled submit is a dead-end. */
export const APPLY_WALLET_LOAD_FAILED =
  'Could not load your linked wallets — check your connection and try again.'
export const APPLY_WALLET_RETRY = 'Try again'

export const APPLY_SUCCESS = 'Application sent. The poster decides who gets the gig.'
export const WITHDRAW_SUCCESS = 'Application withdrawn.'
export const RELEASE_SUCCESS =
  "Thanks for saying so — the poster has been told you're no longer available."

/** Explains the shortlist timer before the poster compares individual rows. */
export const APPLICANT_REVIEW_GUIDANCE =
  'Each timer shows how long that application remains available. Assigning a worker starts their delivery window.'

export const APPLICANT_REVIEW_INFORMATION: NoticeContent = {
  summary: 'Application timers show how long each worker remains available.',
  title: 'Understanding application timers',
  description: APPLICANT_REVIEW_GUIDANCE,
  tone: 'info',
}

/** Applicant-voiced purpose for the application expiry countdown. */
export const APPLICATION_ASSIGNMENT_COUNTDOWN_LABEL =
  'Time left for the poster to assign you'

/**
 * Prompts for the two off-chain actions that ask before acting, shaped to
 * spread straight onto `ConfirmDialog`.
 *
 * Grouped rather than left as loose strings because TWO surfaces raise the
 * withdraw prompt — the gig detail and the My Applications tab — and a prompt
 * assembled twice is one that drifts: a change to `destructive`, or a fourth
 * field, would have to be remembered in both.
 */
export const WITHDRAW_CONFIRM = {
  title: 'Withdraw your application?',
  message:
    'The poster will no longer be able to pick you for this gig. You can apply again while it stays open.',
  confirmLabel: 'Withdraw',
  destructive: true,
} as const

export const RELEASE_CONFIRM = {
  title: "Tell the poster you're not available?",
  message:
    "This frees you up straight away and asks the poster to release the gig. It won't count against your standing — but do it before the delivery window runs out.",
  confirmLabel: "I'm not available",
  destructive: true,
} as const

/**
 * Empty states for the poster's shortlist, keyed by the filter that produced
 * them — shaped to spread straight onto `EmptyState`.
 *
 * An empty "Waiting" tab does NOT mean nobody applied: assigning settles every
 * other application (D4) and the sweep expires the rest, so a gig with eleven
 * applicants shows an empty list the moment none of them are still live.
 * "Workers who apply will show up here" is only true of the unfiltered view.
 */
export const APPLICANTS_EMPTY = {
  open: {
    title: 'Nobody waiting on you',
    description:
      'Applications still live show up here. Switch to All for the ones that have closed.',
  },
  all: {
    title: 'No applicants yet',
    description:
      'Workers who apply will show up here. You pick one, and only then does the gig start.',
  },
} as const

export const MY_APPLICATIONS_EMPTY = {
  title: 'No applications',
  description:
    'Gigs that ask for approval show an Apply button. Applications you send appear here until a poster decides.',
} as const

/** Poster-facing label for the CTA that opens the shortlist. */
export function applicantsCtaLabel(count: number | null): string {
  if (count === null || count === 0) return 'View applicants'
  return `View applicants (${count})`
}

/**
 * The APPLICANT's own status line. Reads as a sentence rather than a status
 * enum because these words are the only explanation the applicant ever gets.
 *
 * Second person throughout, so it must never be shown on the poster's
 * shortlist — see `applicantStatusLine` for that side.
 */
export function applicationStatusLine(
  status: ApplicationStatus,
  expiresInSeconds: number | null,
): string {
  switch (status) {
    case 'open':
      return expiresInSeconds !== null && expiresInSeconds > 0
        ? `Waiting on the poster — expires in ${formatDuration(expiresInSeconds)}`
        : 'Waiting on the poster'
    case 'assigned':
      return "You got this gig — it's yours to deliver"
    case 'passed':
      return 'The poster picked someone else'
    case 'expired':
      return 'Expired before the poster decided'
    case 'withdrawn':
      return 'You withdrew this application'
    case 'released':
      return 'The poster released your assignment'
  }
}

/**
 * The line above the applicant's Withdraw button, which is NOT always "waiting
 * on the poster".
 *
 * Only an assignment settles the other applications (D4); cancelling or
 * refunding a gig settles none of them, and the expiry sweep closes them at
 * its own pace — so an `open` row routinely outlives the gig it is on, for as
 * long as the application TTL. Telling that applicant the poster is still
 * deciding is simply false.
 *
 * Withdraw stays offered either way: an open application occupies one of the
 * applicant's `max_open_applications` slots until it expires, so pulling a
 * dead one is the only way to get that slot back.
 */
export function openApplicationLine(gig: OpenApplicationGig): string {
  // "Still open" is not enough on its own: past `accept_deadline` the poster
  // cannot assign anybody either — the gig is on the refund path — so an
  // expired-but-open gig reads exactly like a cancelled one from here.
  const stillTakingWorkers = gig.status === 'open' && acceptWindowState(gig) !== 'closed'
  return stillTakingWorkers
    ? applicationStatusLine('open', null)
    : 'This gig is no longer taking workers. Withdraw to free the slot for another application.'
}

/**
 * The same row as the POSTER reads it, on their shortlist.
 *
 * A separate function rather than a parameter because it is a different
 * sentence about a different person, not a variant of one: "You withdrew this
 * application" shown to the poster is simply false, and "The poster picked
 * someone else" is nonsense addressed to the poster who did the picking.
 */
export function applicantStatusLine(status: ApplicationStatus): string {
  switch (status) {
    case 'open':
      return 'Waiting on you'
    case 'assigned':
      return 'You picked this worker'
    case 'passed':
      return 'Not selected'
    case 'expired':
      return 'Expired before you decided'
    case 'withdrawn':
      return 'They withdrew'
    case 'released':
      return 'You released this assignment'
  }
}

/**
 * Why an unassign is being warned about (critical assessment #3), in the
 * poster's two genuinely different situations.
 *
 * Keyed by `acceptWindowState` rather than written as one sentence because
 * "closes soon" is false once the deadline has passed — and that is the COMMON
 * case, not the exotic one: the unassign window runs from the assignment, so a
 * gig assigned near its deadline spends almost all of that window past it. The
 * poster there is not being asked to hurry, they are being told the gig cannot
 * be re-assigned at all.
 */
export const UNASSIGN_WINDOW_INFORMATION: Record<
  'closing' | 'closed',
  NoticeContent
> = {
  closing: {
    summary: 'Gig reassignment may be limited by its closing time.',
    title: 'Limited time to reassign',
    description:
      'This gig closes to new workers soon. Releasing the current worker does not extend that deadline. If nobody else is assigned in time, you will need to claim a refund and repost the gig.',
    tone: 'warning',
  },
  closed: {
    summary: 'This gig can no longer be assigned to another worker.',
    title: 'Reassignment is closed',
    description:
      'This gig has already closed to new workers. Releasing this assignment means you cannot choose another worker and will need to claim a refund and post the gig again.',
    tone: 'danger',
  },
}
