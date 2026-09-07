/**
 * The gig-detail folder's strings: the public listing's sentences
 * (`GIG_DETAIL_COPY`, Tier 1 comp lines 547-683) and the proof-upload
 * dialog's own control label (`PROOF_DIALOG_COPY`).
 *
 * Product facts come from `@tenda/shared`; only sentences live here — and
 * where shared already owns the PHRASING of a fact, this calls into it rather
 * than restating it. The proof block is why that clause is here: it used to
 * hand-roll a list the shared formatter owns, and then to keep a verbatim copy
 * of mobile's own sentences, so the same requirement reached one worker in two
 * voices. Those sentences are shared `PROOF_COPY` now.
 */

import { BOUND_WALLET_LABEL } from '@tenda/shared'

export const GIG_DETAIL_COPY = {
  breadcrumbRoot: 'All gigs',
  brief: 'The brief',
  briefEmpty: 'The poster left no brief. The terms below are the whole agreement.',
  terms: 'Terms of this escrow',
  proof: 'Proof you must submit',
  proofAnyTitle: 'Any evidence',
  proofAnyHint: 'This gig names no required proof type — attach whatever shows the work was done.',
  proofHint: {
    image: 'A clear photo, taken at the place the work happened.',
    video: 'A short clip. Long uploads fail more often than they help.',
    document: 'A receipt, invoice or signed note as a file.',
    geotag: "A location check-in from the work site — it must fall within this gig's radius.",
    text: 'A written answer, typed straight into the proof form.',
    structured: 'The exact fields this gig asks for, filled in as data.',
  },
  postedBy: 'Posted by',
  /** The counterparty card's role line to the CREATOR (party-view.ts pairs it
   *  with `postedBy` for the other seat) — one source for both surfaces that
   *  draw the card. */
  worker: 'Worker',
  /** Label over the viewer-relative bound wallet (`my_signer_address`). The
   *  string is SHARED with mobile and with the exchange terms card — one
   *  escrow must name the fact identically wherever it is read. */
  yourWallet: BOUND_WALLET_LABEL,
  postedByNote:
    'Full profiles, message threads and dispute history are visible to signed-in users.',
  noRating: 'No reviews yet',
  ratingCaption: 'out of 5',
  locked: 'Locked in escrow',
  feePending: 'The worker payout is this funded amount minus the platform fee.',
  /** Both figures or neither: `escrowFeeBreakdown` answers all-null until the
   *  config loads, so the caller shows `feePending` instead of calling this.
   *  `amount` is the shared `formatAssetAmount` figure — ticker INCLUDED. It
   *  took a separate symbol once (#65) and every detail read "24.375 USDC
   *  USDC"; one renderer of the ticker, and it is shared's. */
  workerReceives: (amount: string, feePct: string) =>
    `Worker receives ${amount} after the ${feePct}% platform fee.`,
  lockedOn: (chain: string) =>
    `Funds were locked on ${chain} before this gig was listed. Neither side can move them alone.`,
  settleTitle: 'How it settles',
  settleLink: 'How escrow works',
  settleSteps: {
    apply: 'You apply, and the poster picks who does the work.',
    accept: 'You accept, and the work is yours the moment you do.',
    rest: [
      'You do the work and submit the proof listed above.',
      'The poster approves, or the approval deadline passes.',
      'Escrow releases the net amount to your wallet.',
    ],
  },
  /** The gig exists as far as we know — we just could not read it. */
  unavailableTitle: 'We could not load this gig',
  unavailableBody:
    'The gig index did not respond. This is a read failure only — no escrow, no balance and no agreement is affected by it.',
  unavailableAction: 'Try again',
  unavailableBrowse: 'Browse open gigs',
  crossBorder: 'Cross-border',
  postedPrefix: 'Posted',
  terminology: {
    payment: 'Payment',
    chain: 'Chain',
    location: 'Location',
    deliverWithin: 'Time to complete',
    acceptingUntil: 'Accepting until',
    posted: 'Posted',
    proofRequired: 'Proof required',
    arrangement: 'Arrangement',
  },
} as const

/**
 * What this dialog's own CONTROLS say. Everything the product says about proof
 * — the requirement, what is still missing, what the escrow already holds —
 * moved to shared `PROOF_COPY`, because a worker must not be told the same
 * fact two ways by the app and the web. What is left is web-only by nature:
 * mobile's Button hides its label behind a spinner, so it has no twin for
 * this and never did.
 */
export const PROOF_DIALOG_COPY = {
  /** The retry has nothing to upload, so "Uploading…" would be a lie. */
  working: (reusing: boolean) => (reusing ? 'Submitting…' : 'Uploading…'),
} as const
