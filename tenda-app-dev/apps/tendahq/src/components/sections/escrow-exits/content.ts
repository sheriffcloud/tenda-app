/**
 * §04 When things go wrong — every way an escrow ends other than approval.
 *
 * GROUPED BY WHO HAS TO BE INVOLVED, and the grouping is DERIVED. The routes
 * used to be a lettered A–E list, which made five different things look
 * interchangeable. What actually separates them is whether Tenda is in the
 * loop, and exactly one of them is — so `needsTenda` is declared per route and
 * the section groups on it. The claim "four need nobody but you" is then a
 * consequence of the data rather than a sentence written beside it, and a test
 * pins the count so the two cannot drift apart.
 *
 * EVERY ROUTE IS ONE THE CONTRACTS ACTUALLY IMPLEMENT. There are five, not
 * four: cancel, expire, claim-unpaid, reclaim and dispute. Claim-unpaid is a
 * worker PULL (`claimStalledPayment`), never an automatic release — nothing
 * sweeps the chain on the worker's behalf. Disputes open from Accepted OR
 * Submitted (`_disputable`), so a worker does not have to submit proof first
 * to escalate.
 *
 * EACH ROUTE IS A TRIGGER AND AN OUTCOME, split in the data so the row can
 * set them either side of the arrow rather than parsing a sentence for one.
 */

import { APPROVAL_WINDOW_HOURS } from '@/content'
import { numberWord } from '@/lib/number-words'

export interface ExitRoute {
  /** Short name — the row's heading. */
  name: string
  /** What has to be true for this exit to open. */
  trigger: string
  /** What happens when someone takes it. */
  outcome: string
  /** Who can take this exit. */
  actor: string
  /** When it opens. */
  time: string
  /**
   * True for the one route that waits on a Tenda ruling. Optional, so the
   * self-serve routes say nothing rather than each carrying a `false` — and so
   * the grouping below reads as "the exception" rather than a flag on five.
   */
  needsTenda?: true
}

export const EXIT_ROUTES: readonly ExitRoute[] = [
  {
    name: 'Cancel',
    trigger: 'Nobody has accepted yet',
    outcome: 'the funds return to whoever locked them',
    actor: 'Poster · seller',
    time: 'pre-accept',
  },
  {
    name: 'Expire',
    trigger: 'Nobody accepts before the deadline',
    outcome: 'the locker refunds themselves on-chain, so nothing stays parked in a job no one wanted',
    actor: 'Poster · seller',
    time: 'accept deadline',
  },
  {
    name: 'Claim unpaid',
    trigger: 'Proof is in, and the poster neither approves nor disputes',
    outcome: 'the worker claims the payment, split exactly as an approval would have been — a claim you make, not a release that happens to you',
    actor: 'Worker',
    time: `${APPROVAL_WINDOW_HOURS}h`,
  },
  {
    name: 'Reclaim',
    trigger: 'Accepted, but proof never submitted',
    outcome: 'once the completion deadline plus a short grace period passes, the poster claims the refund',
    actor: 'Poster',
    time: 'deadline + grace',
  },
  {
    name: 'Dispute',
    trigger: 'Either side escalates once work is accepted — before or after proof',
    outcome: 'mediation reviews the evidence and instructs the program to pay the worker, refund the poster, or split between them',
    actor: 'Either party',
    time: 'mediated',
    needsTenda: true,
  },
]

/** Routes the two parties settle between themselves. */
export const SELF_SERVE_ROUTES: readonly ExitRoute[] = EXIT_ROUTES.filter(
  (route) => route.needsTenda !== true,
)

/** The exception — routes that wait on a Tenda ruling. */
export const MEDIATED_ROUTES: readonly ExitRoute[] = EXIT_ROUTES.filter(
  (route) => route.needsTenda === true,
)

/**
 * Group headings. The counts are DERIVED, for the reason the whole file is:
 * an earlier version of this page wrote "four of the five" into prose beside a
 * list it did not read, which is exactly how a number goes stale while the
 * thing it counts changes underneath it.
 */
export const EXIT_GROUPS = {
  selfServe: {
    title: 'Between you and your counterparty',
    count: `${SELF_SERVE_ROUTES.length} exits`,
    note: 'Tenda not in the loop',
  },
  mediated: {
    title: 'Waits on Tenda',
    count: `${MEDIATED_ROUTES.length} exit`,
    note: 'The one place your money depends on us',
  },
} as const

export const EXIT_HEADER = {
  eyebrow: 'When things go wrong',
  /** "Five exits · four need nobody but you" — both numbers read off the routes. */
  aside: `${numberWord(EXIT_ROUTES.length, true)} exits · ${numberWord(SELF_SERVE_ROUTES.length)} need nobody but you`,
  h2: ['Escrow resolves', "It doesn't disappear"],
  sub: 'If proof is missing or contested, every escrow still has a way out: a deadline opens the exit and either party takes it. They are grouped below by the only thing that really separates them — who has to be involved.',
} as const

/** Column headings for the route rows. */
export const EXIT_LABELS = { actor: 'Who acts', time: 'Opens' } as const
